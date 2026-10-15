import { Injectable, Logger } from "@nestjs/common";
import { randomBytes } from "crypto";
import type {
  Campaign,
  CrmTrigger,
  EnrollmentStatus,
  Prisma,
} from "@prisma/client";
import { ENROLLMENT_STATUSES } from "@omnidance/shared";
import { PrismaService } from "../../prisma.service";
import { NotificationsService } from "../../notifications/domain/notifications.service";
import { ParamsService } from "../../params/params.service";
import {
  decodeClassRef,
  decodeMembershipRef,
  decodePrivateRef,
  decodeSeriesPassRef,
} from "../../payments/domain/order-ref";

// CRM transversal (omni-dance.md - CRM por actor): scores de relación,
// tags, campañas y triggers automáticos para PRODUCER / ACADEMY.
// Servicio de orquestación con PrismaService inyectado (estilo ParamsService);
// la autorización por actor vive en el controller (assertActorAccess).

export const CRM_TRIGGER_KEYS = [
  "WINBACK",
  "TRIAL_EXPIRING",
  "REGULAR_NO_PRESALE",
  "ATTENDANCE_DROP",
  "SEGMENT_ENTER",
  "SEGMENT_EXIT",
] as const;

/**
 * Alcance por actor de cada trigger key (spec crm-trigger-actor-scope):
 * TRIAL_EXPIRING solo tiene sentido con enrollments de academia;
 * REGULAR_NO_PRESALE con preventa de eventos del productor.
 * Una key ausente del mapa aplica a todos los actores.
 */
const TRIGGER_ACTOR_TYPES: Readonly<Record<string, readonly string[]>> = {
  TRIAL_EXPIRING: ["ACADEMY"],
  REGULAR_NO_PRESALE: ["PRODUCER"],
};
export type CrmTriggerKey = (typeof CRM_TRIGGER_KEYS)[number];

// Triggers dirigidos por evento (diff de membresía de ActorSegment en
// cada recompute) — no se evalúan por fecha en el cron de triggers.
const EVENT_TRIGGER_KEYS = new Set(["SEGMENT_ENTER", "SEGMENT_EXIT"]);

// Campos/ops permitidos en las reglas de ActorSegment
// (spec crm-dynamic-segments).
const NUM_OPS = ["eq", "neq", "gt", "gte", "lt", "lte"] as const;
const SEGMENT_RULE_OPS: Record<string, readonly string[]> = {
  score: NUM_OPS,
  attendanceRecent: NUM_OPS,
  weeklyStreak: NUM_OPS,
  monthsContinuous: NUM_OPS,
  purchases: NUM_OPS,
  earlyPurchases: NUM_OPS,
  tenure: NUM_OPS,
  referrals: NUM_OPS,
  spend: NUM_OPS,
  segment: ["eq", "neq"],
  tag: ["present", "absent"],
};
const SEGMENT_RULE_FIELDS = new Set(Object.keys(SEGMENT_RULE_OPS));

type CrmErrorCode = "NOT_FOUND" | "BAD_REQUEST" | "CONFLICT";

export class CrmDomainError extends Error {
  constructor(
    readonly code: CrmErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "CrmDomainError";
  }
}

/** Segmento de campaña - los criterios presentes se unen (OR lógico).
 *  allStudents/enrollmentStatus/planId/seriesId solo valen para ACADEMY. */
interface CampaignSegment {
  tags?: string[];
  segment?: string;
  personIds?: string[];
  allStudents?: boolean;
  enrollmentStatus?: string[];
  planId?: string;
  seriesId?: string;
  /** id de ActorSegment guardado (spec crm-dynamic-segments) — resuelve
   *  a la membresía materializada en el último recompute. */
  segmentRef?: string;
}

type CampaignAction =
  | { type: "NOTIFY"; title: string; body?: string }
  | {
      type: "DISCOUNT_CODE";
      percentOff?: number;
      amountOff?: number;
      maxUses?: number;
      expiresAt?: string;
    };

export interface TriggerEvalResult {
  evaluated: number;
  notified: number;
}

/** Fila de GET /crm/people: score (si existe) + tags + join person. */
export interface CrmPersonRow {
  personId: string;
  score: number | null;
  segment: string | null;
  computedAt: Date | null;
  person: { id: string; name: string; photoUrl: string | null } | null;
  tags: Array<{
    id: string;
    actorType: string;
    actorId: string;
    personId: string;
    tag: string;
    note: string | null;
    createdAt: Date;
  }>;
}

/** Actividad agregada por persona dentro del universo del actor. */
interface PersonActivity {
  attendance: number;
  spend: number; // CLP (Σ Payment.amount PAID atribuible al actor)
  referrals: number; // Referral{referrerId: personId}
  firstAt: Date | null;
  lastAt: Date | null;
  // Señales ACADEMY (spec academy-score-refine) - 0 para otros actores.
  attendanceRecent: number; // asistencias últimas attendance_weeks semanas
  attendanceRecent4w: number; // asistencias últimas 4 semanas
  attendancePrev4w: number; // asistencias 4-8 semanas atrás
  weeklyStreak: number; // semanas consecutivas con ≥1 asistencia
  monthsContinuous: number; // meses calendario seguidos con actividad/membresía
  purchases: number; // compras PAID/claims APPROVED últimos purchase_months
  tenureMonths: number; // meses desde la primera actividad del universo
  // PRODUCER (spec producer-score-refine):
  earlyPurchases: number; // compras TICKET ≥early_days antes del evento
  // Caída calculada por el cómputo del actor (academy: 4w/4w; producer:
  // últimos 2 eventos sin checkin tras ≥2 de los 5 anteriores).
  dropping: boolean;
}

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;
const CORE_ATTENDANCES = 3; // "regular" del trigger REGULAR_NO_PRESALE
const DEFAULT_NOTIFY_COOLDOWN_DAYS = 7;

/** Pesos/umbrales del score ACADEMY - leídos de PlatformParam por recompute. */
interface ScoreParams {
  attendanceWeeks: number;
  attendancePts: number;
  streakCap: number;
  streakPts: number;
  monthsCap: number;
  monthsPts: number;
  purchaseMonths: number;
  purchaseCap: number;
  purchasePts: number;
  tenureCap: number;
  tenurePts: number;
  referralPts: number;
  coreMin: number;
  newDays: number;
  bringsReferrals: number;
  winbackDays: number;
  earlyPts: number;
  earlyCap: number;
  earlyDays: number;
}

/** "YYYY-MM-DD" del instante en America/Santiago (calendario civil local). */
const dtfSantiago = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Santiago",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Medianoche del día civil local expresada como UTC (índice de día). */
function localDayUtc(d: Date): number {
  const [y, m, dd] = dtfSantiago.format(d).split("-").map(Number);
  return Date.UTC(y, m - 1, dd);
}

/** Índice de semana civil (lunes-inicio) en Santiago. 1970-01-01 fue
 *  jueves: el shift +3d hace que la semana indexada empiece en lunes. */
function weekIndex(d: Date): number {
  return Math.floor((localDayUtc(d) + 3 * DAY_MS) / WEEK_MS);
}

/** Índice de mes civil absoluto (año*12 + mes) en Santiago. */
function monthIndex(d: Date): number {
  const [y, m] = dtfSantiago.format(d).split("-").map(Number);
  return y * 12 + (m - 1);
}

@Injectable()
export class CrmService {
  private readonly logger = new Logger(CrmService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly params: ParamsService,
  ) {}

  // ═══════════════════ PEOPLE / TAGS ═══════════════════

  /**
   * Universo visible del actor: personas con RelationshipScore y/o ActorTag,
   * ordenado por score desc (tag-only al final). El merge scores+tags es en
   * memoria (universo acotado al actor); los filtros q/segment/tag se aplican
   * sobre ese merge y el join person{id,name,photoUrl} se hace solo para la
   * página pedida. Devuelve el envelope {items,total,page,pageSize} +
   * segmentCounts/allTags del universo completo (stats y opciones del UI).
   */
  async listPeople(
    actorType: string,
    actorId: string,
    filter: {
      q?: string;
      segment?: string;
      tag?: string;
      segmentId?: string;
      sort?: string;
    } = {},
    pg?: { page: number; pageSize: number; skip: number; take: number },
  ) {
    const [scores, tags] = await Promise.all([
      this.prisma.relationshipScore.findMany({
        where: { actorType, actorId },
        orderBy: { score: "desc" },
      }),
      this.prisma.actorTag.findMany({
        where: { actorType, actorId },
        orderBy: { createdAt: "asc" },
      }),
    ]);

    const tagsByPerson = new Map<string, typeof tags>();
    for (const t of tags) {
      const list = tagsByPerson.get(t.personId) ?? [];
      list.push(t);
      tagsByPerson.set(t.personId, list);
    }

    type RowBase = Omit<CrmPersonRow, "person">;
    const allRows: RowBase[] = scores.map((s) => ({
      personId: s.personId,
      score: s.score,
      segment: s.segment,
      computedAt: s.computedAt,
      tags: tagsByPerson.get(s.personId) ?? [],
    }));
    const withScore = new Set(scores.map((s) => s.personId));
    for (const t of tags) {
      if (withScore.has(t.personId)) continue;
      withScore.add(t.personId);
      allRows.push({
        personId: t.personId,
        score: null,
        segment: null,
        computedAt: null,
        tags: tagsByPerson.get(t.personId) ?? [],
      });
    }

    // Stats del universo completo (sin filtros): badges por segmento y
    // opciones del select de tags de la tabla.
    const segmentCounts: Record<string, number> = {};
    const tagSet = new Set<string>();
    for (const r of allRows) {
      const k = r.segment ?? "NONE";
      segmentCounts[k] = (segmentCounts[k] ?? 0) + 1;
      for (const tg of r.tags) tagSet.add(tg.tag);
    }

    let filtered = allRows;
    // Segmento guardado (spec crm-dynamic-segments): restringe a la
    // membresía materializada del ActorSegment del actor.
    if (filter.segmentId) {
      const seg = await this.prisma.actorSegment.findFirst({
        where: { id: filter.segmentId, actorType, actorId },
        select: { id: true },
      });
      if (!seg) {
        throw new CrmDomainError("NOT_FOUND", "segmento no encontrado");
      }
      const members = await this.prisma.actorSegmentMembership.findMany({
        where: { segmentId: filter.segmentId },
        select: { personId: true },
      });
      const memberSet = new Set(members.map((m) => m.personId));
      filtered = filtered.filter((r) => memberSet.has(r.personId));
    }
    const seg = filter.segment;
    if (seg && seg !== "ALL") {
      filtered = filtered.filter((r) =>
        seg === "NONE" ? r.segment === null : r.segment === seg,
      );
    }
    const tagF = filter.tag;
    if (tagF && tagF !== "ALL") {
      filtered = filtered.filter((r) => r.tags.some((tg) => tg.tag === tagF));
    }
    const term = filter.q?.trim();
    if (term) {
      // q matchea nombre de person (join previo, universo ya acotado) o texto
      // del tag - igual que el filtro client-side original.
      const named = await this.prisma.person.findMany({
        where: {
          id: { in: filtered.map((r) => r.personId) },
          name: { contains: term, mode: "insensitive" },
        },
        select: { id: true },
      });
      const nameMatch = new Set(named.map((p) => p.id));
      const needle = term.toLowerCase();
      filtered = filtered.filter(
        (r) =>
          nameMatch.has(r.personId) ||
          r.tags.some((tg) => tg.tag.toLowerCase().includes(needle)),
      );
    }

    // Ordenación sobre el universo filtrado, antes de paginar. Default:
    // score desc con tag-only al final (orden ya armado arriba).
    let sorted = filtered;
    if (filter.sort === "score_asc") {
      sorted = [...filtered].sort(
        (a, b) => (a.score ?? Infinity) - (b.score ?? Infinity),
      );
    } else if (filter.sort === "name_asc") {
      const named = await this.prisma.person.findMany({
        where: { id: { in: filtered.map((r) => r.personId) } },
        select: { id: true, name: true },
      });
      const nameById = new Map(named.map((p) => [p.id, p.name]));
      sorted = [...filtered].sort((a, b) => {
        const an = nameById.get(a.personId);
        const bn = nameById.get(b.personId);
        if (an == null && bn == null) return 0;
        if (an == null) return 1;
        if (bn == null) return -1;
        return an.localeCompare(bn, "es");
      });
    }

    const total = filtered.length;
    const pageRows = pg ? sorted.slice(pg.skip, pg.skip + pg.take) : sorted;

    const people = await this.prisma.person.findMany({
      where: { id: { in: pageRows.map((r) => r.personId) } },
      select: { id: true, name: true, photoUrl: true },
    });
    const personById = new Map(people.map((p) => [p.id, p]));

    return {
      items: pageRows.map(
        (r): CrmPersonRow => ({
          ...r,
          person: personById.get(r.personId) ?? null,
        }),
      ),
      total,
      page: pg?.page ?? 1,
      pageSize: pg?.pageSize ?? total,
      segmentCounts,
      allTags: [...tagSet].sort((a, b) => a.localeCompare(b, "es")),
    };
  }

  /**
   * Ficha del contacto dentro del universo del actor: person brief,
   * score/segment, tags del actor, resumen de actividad (la misma
   * computeActivity que alimenta el score) y las últimas acciones
   * recientes con etiqueta legible. La persona sin score, tag ni
   * actividad está fuera del universo → 404.
   */
  async personDetail(actorType: string, actorId: string, personId: string) {
    const [score, tags, person] = await Promise.all([
      this.prisma.relationshipScore.findUnique({
        where: {
          actorType_actorId_personId: { actorType, actorId, personId },
        },
      }),
      this.prisma.actorTag.findMany({
        where: { actorType, actorId, personId },
        orderBy: { createdAt: "asc" },
      }),
      this.prisma.person.findUnique({
        where: { id: personId },
        select: { id: true, name: true, photoUrl: true },
      }),
    ]);

    const activity =
      (await this.computeActivity(actorType, actorId)).get(personId) ?? null;

    if (!score && tags.length === 0 && !activity) {
      throw new CrmDomainError("NOT_FOUND", "persona fuera del universo");
    }

    const recent = await this.recentActivity(actorType, actorId, personId);
    return {
      person,
      personId,
      score: score?.score ?? null,
      segment: score?.segment ?? null,
      breakdown: score?.breakdown ?? null,
      computedAt: score?.computedAt ?? null,
      tags,
      activity: activity
        ? {
            attendance: activity.attendance,
            spend: activity.spend,
            referrals: activity.referrals,
            firstAt: activity.firstAt,
            lastAt: activity.lastAt,
          }
        : null,
      recent,
    };
  }

  /**
   * Últimas acciones del contacto dentro del universo del actor (máx 10,
   * merge por fecha desc). Payment/Checkin no tienen relación a Event:
   * los nombres se resuelven por mapa de eventIds del productor.
   */
  private async recentActivity(
    actorType: string,
    actorId: string,
    personId: string,
  ) {
    type Item = {
      type: "CHECKIN" | "PAYMENT" | "ENROLLMENT" | "ATTENDANCE";
      at: Date;
      label: string;
      amount?: number;
      status?: string;
    };
    const items: Item[] = [];

    if (actorType === "PRODUCER") {
      const events = await this.prisma.event.findMany({
        where: { producerId: actorId },
        select: { id: true, name: true },
      });
      const nameByEvent = new Map(events.map((e) => [e.id, e.name]));
      const eventIds = events.map((e) => e.id);
      if (eventIds.length === 0) return items;

      const [checkins, payments] = await Promise.all([
        this.prisma.checkin.findMany({
          where: { personId, voidedAt: null, eventId: { in: eventIds } },
          orderBy: { inAt: "desc" },
          take: 10,
          select: { eventId: true, inAt: true },
        }),
        this.prisma.payment.findMany({
          where: { personId, status: "PAID", eventId: { in: eventIds } },
          orderBy: { createdAt: "desc" },
          take: 10,
          select: { eventId: true, amount: true, createdAt: true },
        }),
      ]);
      for (const c of checkins) {
        items.push({
          type: "CHECKIN",
          at: c.inAt,
          label: nameByEvent.get(c.eventId) ?? "",
        });
      }
      for (const p of payments) {
        items.push({
          type: "PAYMENT",
          at: p.createdAt,
          label: nameByEvent.get(p.eventId ?? "") ?? "",
          amount: p.amount,
        });
      }
    } else if (actorType === "ACADEMY") {
      const [enrollments, attendances] = await Promise.all([
        this.prisma.enrollment.findMany({
          where: { personId, academyId: actorId },
          orderBy: { startedAt: "desc" },
          take: 10,
          select: {
            startedAt: true,
            status: true,
            plan: { select: { name: true } },
          },
        }),
        this.prisma.attendance.findMany({
          where: { personId, class: { slot: { academyId: actorId } } },
          orderBy: { checkedAt: "desc" },
          take: 10,
          select: {
            checkedAt: true,
            class: {
              select: {
                date: true,
                slot: { select: { series: { select: { name: true } } } },
              },
            },
          },
        }),
      ]);
      for (const e of enrollments) {
        items.push({
          type: "ENROLLMENT",
          at: e.startedAt,
          label: e.plan?.name ?? "",
          status: e.status,
        });
      }
      for (const a of attendances) {
        items.push({
          type: "ATTENDANCE",
          at: a.checkedAt,
          label: a.class.slot.series.name,
        });
      }
    }

    return items
      .sort((x, y) => y.at.getTime() - x.at.getTime())
      .slice(0, 10);
  }

  /**
   * Crea un ActorTag; si ya existe uno exacto (actor+person+tag) retorna el
   * existente con created:false (el controller lo sirve como 200).
   */
  async addTag(
    actorType: string,
    actorId: string,
    personId: string,
    tag: string,
    note?: string,
  ) {
    const existing = await this.prisma.actorTag.findFirst({
      where: { actorType, actorId, personId, tag },
    });
    if (existing) return { tag: existing, created: false };
    const created = await this.prisma.actorTag.create({
      data: { actorType, actorId, personId, tag, note: note ?? null },
    });
    return { tag: created, created: true };
  }

  findTag(id: string) {
    return this.prisma.actorTag.findUnique({ where: { id } });
  }

  async deleteTag(id: string): Promise<void> {
    await this.prisma.actorTag.delete({ where: { id } });
  }

  /**
   * Tags en lote (spec crm-campaign-ops): op "add" crea el tag en cada
   * persona sin duplicar (dedup por actor+persona+tag), op "remove" lo
   * borra. Devuelve cuántas filas se afectaron.
   */
  async bulkTag(
    actorType: string,
    actorId: string,
    personIds: string[],
    tag: string,
    op: "add" | "remove",
  ): Promise<{ affected: number }> {
    const trimmed = tag.trim();
    if (!trimmed) {
      throw new CrmDomainError("BAD_REQUEST", "tag requerido");
    }
    const ids = [...new Set(personIds.filter(Boolean))];
    if (!ids.length) {
      throw new CrmDomainError("BAD_REQUEST", "personIds vacío");
    }
    if (op === "remove") {
      const r = await this.prisma.actorTag.deleteMany({
        where: { actorType, actorId, tag: trimmed, personId: { in: ids } },
      });
      return { affected: r.count };
    }
    const existing = new Set(
      (
        await this.prisma.actorTag.findMany({
          where: { actorType, actorId, tag: trimmed, personId: { in: ids } },
          select: { personId: true },
        })
      ).map((t) => t.personId),
    );
    const toCreate = ids.filter((p) => !existing.has(p));
    if (toCreate.length) {
      await this.prisma.actorTag.createMany({
        data: toCreate.map((personId) => ({
          actorType,
          actorId,
          personId,
          tag: trimmed,
        })),
      });
    }
    return { affected: toCreate.length };
  }

  // ═══════════════════ SCORES ═══════════════════

  /**
   * Recalcula RelationshipScore por persona para el actor.
   *
   * Universo:
   * - PRODUCER → checkins no anulados + pagos PAID en eventos del productor.
   * - ACADEMY  → enrollments de la academia + attendances en clases de sus
   *   slots + compras resueltas por refId (mem_/wks_/pvt_) y claims
   *   APPROVED + membresías vigentes.
   *
   * Fórmula (specs academy/producer-score-refine, pesos en crm.score.*):
   * score = min(100, recent×attPts + min(streak,cap)×streakPts
   *   + min(months,cap)×monthsPts + min(purchases,cap)×purchasePts
   *   + min(early,earlyCap)×earlyPts   (solo PRODUCER)
   *   + min(tenure,cap)×tenurePts + referrals×refPts)
   *
   * segment (primer match):
   * - NEW           primera actividad < crm.new_days (default 30)
   * - AT_RISK       última actividad > crm.winback_days (default 21) o
   *                 caída (academy 4w/4w; producer últimos 2 eventos)
   * - BRINGS_PEOPLE ≥ crm.brings_people_referrals (default 2)
   * - CORE          score ≥ crm.score.core_min (default 60)
   * - null          resto
   *
   * Al final sincroniza las membresías de los ActorSegment del actor
   * (spec crm-dynamic-segments): el diff dispara triggers
   * SEGMENT_ENTER/SEGMENT_EXIT.
   */
  async recomputeScores(
    actorType: string,
    actorId: string,
  ): Promise<{ updated: number }> {
    const p = await this.scoreParams();
    const activity = await this.computeActivity(actorType, actorId, p);
    const now = new Date();

    const computed = new Map<
      string,
      { a: PersonActivity; score: number; segment: string | null }
    >();
    let updated = 0;
    for (const [personId, a] of activity) {
      const { score, breakdown } = this.computeScore(actorType, a, p);
      const segment = this.computeSegment(a, score, p, now);
      await this.prisma.relationshipScore.upsert({
        where: {
          actorType_actorId_personId: { actorType, actorId, personId },
        },
        update: {
          score,
          segment,
          breakdown: breakdown as Prisma.InputJsonValue,
          computedAt: now,
        },
        create: {
          actorType,
          actorId,
          personId,
          score,
          segment,
          breakdown: breakdown as Prisma.InputJsonValue,
        },
      });
      computed.set(personId, { a, score, segment });
      updated++;
    }
    await this.syncSegments(actorType, actorId, computed);
    return { updated };
  }

  /**
   * Recompute de todos los actores con universo propio - handler del job
   * diario `crm.scores`. Devuelve conteos por actorType para JobRun.meta.
   */
  async recomputeAllScores(): Promise<Record<string, number>> {
    const [academies, producerIds] = await Promise.all([
      this.prisma.academy.findMany({
        where: { active: true },
        select: { id: true },
      }),
      this.prisma.event.findMany({
        where: { producerId: { not: null } },
        select: { producerId: true },
        distinct: ["producerId"],
      }),
    ]);
    const meta: Record<string, number> = {};
    for (const a of academies) {
      try {
        const r = await this.recomputeScores("ACADEMY", a.id);
        meta.ACADEMY = (meta.ACADEMY ?? 0) + r.updated;
      } catch (e) {
        this.logger.warn(`crm.scores academy ${a.id}: ${e}`);
      }
    }
    for (const e of producerIds) {
      try {
        const r = await this.recomputeScores("PRODUCER", e.producerId!);
        meta.PRODUCER = (meta.PRODUCER ?? 0) + r.updated;
      } catch (err) {
        this.logger.warn(`crm.scores producer ${e.producerId}: ${err}`);
      }
    }
    return meta;
  }

  private async scoreParams(): Promise<ScoreParams> {
    const g = (k: string, d: number) => this.params.getNumber(k, d);
    return {
      attendanceWeeks: await g("crm.score.attendance_weeks", 8),
      attendancePts: await g("crm.score.attendance_pts", 4),
      streakCap: await g("crm.score.streak_cap", 8),
      streakPts: await g("crm.score.streak_pts", 3),
      monthsCap: await g("crm.score.months_cap", 6),
      monthsPts: await g("crm.score.months_pts", 4),
      purchaseMonths: await g("crm.score.purchase_months", 6),
      purchaseCap: await g("crm.score.purchase_cap", 6),
      purchasePts: await g("crm.score.purchase_pts", 3),
      tenureCap: await g("crm.score.tenure_cap", 12),
      tenurePts: await g("crm.score.tenure_pts", 1),
      referralPts: await g("crm.score.referral_pts", 5),
      coreMin: await g("crm.score.core_min", 60),
      newDays: await g("crm.new_days", 30),
      bringsReferrals: await g("crm.brings_people_referrals", 2),
      winbackDays: await g("crm.winback_days", 21),
      earlyPts: await g("crm.score.early_pts", 2),
      earlyCap: await g("crm.score.early_cap", 3),
      earlyDays: await g("crm.score.early_days", 3),
    };
  }

  /** Puntaje + breakdown persistible (spec academy-score-refine). */
  private computeScore(
    actorType: string,
    a: PersonActivity,
    p: ScoreParams,
  ): { score: number; breakdown: Record<string, unknown> } {
    if (actorType === "ACADEMY") {
      const points = {
        attendanceRecent: a.attendanceRecent * p.attendancePts,
        weeklyStreak: Math.min(a.weeklyStreak, p.streakCap) * p.streakPts,
        monthsContinuous:
          Math.min(a.monthsContinuous, p.monthsCap) * p.monthsPts,
        purchases: Math.min(a.purchases, p.purchaseCap) * p.purchasePts,
        tenure: Math.min(a.tenureMonths, p.tenureCap) * p.tenurePts,
        referrals: a.referrals * p.referralPts,
      };
      const score = Math.min(
        100,
        points.attendanceRecent +
          points.weeklyStreak +
          points.monthsContinuous +
          points.purchases +
          points.tenure +
          points.referrals,
      );
      return {
        score,
        breakdown: {
          attendanceRecent: a.attendanceRecent,
          weeklyStreak: a.weeklyStreak,
          monthsContinuous: a.monthsContinuous,
          purchases: a.purchases,
          tenure: a.tenureMonths,
          referrals: a.referrals,
          attendanceRecent4w: a.attendanceRecent4w,
          attendancePrev4w: a.attendancePrev4w,
          spend: a.spend,
          points,
        },
      };
    }
    // PRODUCER (spec producer-score-refine): mismas primitivas que
    // ACADEMY con semántica de eventos + earlyPurchases (preventa).
    const points = {
      eventsRecent: a.attendanceRecent * p.attendancePts,
      eventStreak: Math.min(a.weeklyStreak, p.streakCap) * p.streakPts,
      monthsContinuous:
        Math.min(a.monthsContinuous, p.monthsCap) * p.monthsPts,
      purchases: Math.min(a.purchases, p.purchaseCap) * p.purchasePts,
      earlyPurchases:
        Math.min(a.earlyPurchases, p.earlyCap) * p.earlyPts,
      tenure: Math.min(a.tenureMonths, p.tenureCap) * p.tenurePts,
      referrals: a.referrals * p.referralPts,
    };
    const score = Math.min(100, Object.values(points).reduce((s, v) => s + v, 0));
    return {
      score,
      breakdown: {
        eventsRecent: a.attendanceRecent,
        eventStreak: a.weeklyStreak,
        monthsContinuous: a.monthsContinuous,
        purchases: a.purchases,
        earlyPurchases: a.earlyPurchases,
        tenure: a.tenureMonths,
        referrals: a.referrals,
        spend: a.spend,
        points,
      },
    };
  }

  private computeSegment(
    a: PersonActivity,
    score: number,
    p: ScoreParams,
    now: Date,
  ): string | null {
    if (a.firstAt && now.getTime() - a.firstAt.getTime() < p.newDays * DAY_MS) {
      return "NEW";
    }
    const inactive =
      a.lastAt && now.getTime() - a.lastAt.getTime() > p.winbackDays * DAY_MS;
    // "Cayendo": lo fija el cómputo del actor (academy: ventana 4w perdió
    // ≥50% vs la anterior; producer: no asistió a los últimos 2 eventos
    // tras patrón en los 5 anteriores).
    if (inactive || a.dropping) {
      return "AT_RISK";
    }
    if (a.referrals >= p.bringsReferrals) return "BRINGS_PEOPLE";
    // CORE por umbral de score (unificado desde producer-score-refine).
    if (score >= p.coreMin) return "CORE";
    return null;
  }

  /**
   * Actividad por persona dentro del universo del actor.
   * PRODUCER: checkins (voidedAt=null) + payments PAID en sus eventos.
   * ACADEMY: enrollments + attendances en clases de sus ClassSlot +
   * compras PAID resueltas por refId (mem_/wks_/pvt_/claim-) +
   * PaymentClaim APPROVED + membresías vigentes.
   */
  private async computeActivity(
    actorType: string,
    actorId: string,
    p?: ScoreParams,
  ): Promise<Map<string, PersonActivity>> {
    p ??= await this.scoreParams();
    const activity = new Map<string, PersonActivity>();
    const touch = (personId: string, at: Date | null) => {
      const a: PersonActivity = activity.get(personId) ?? {
        attendance: 0,
        spend: 0,
        referrals: 0,
        firstAt: null,
        lastAt: null,
        attendanceRecent: 0,
        attendanceRecent4w: 0,
        attendancePrev4w: 0,
        weeklyStreak: 0,
        monthsContinuous: 0,
        purchases: 0,
        tenureMonths: 0,
        earlyPurchases: 0,
        dropping: false,
      };
      if (at) {
        if (!a.firstAt || at < a.firstAt) a.firstAt = at;
        if (!a.lastAt || at > a.lastAt) a.lastAt = at;
      }
      activity.set(personId, a);
      return a;
    };

    if (actorType === "PRODUCER") {
      await this.computeProducerActivity(actorId, p, activity, touch);
    } else if (actorType === "ACADEMY") {
      await this.computeAcademyActivity(actorId, p, activity, touch);
    } else {
      // Actor types futuros (VENUE/DJ/INSTRUCTOR): sin universo definido aún.
      return activity;
    }

    const ids = [...activity.keys()];
    if (ids.length) {
      const referrals = await this.prisma.referral.findMany({
        where: { referrerId: { in: ids } },
        select: { referrerId: true },
      });
      for (const r of referrals) activity.get(r.referrerId)!.referrals++;
    }
    return activity;
  }

  /**
   * Universo PRODUCER (spec producer-score-refine): checkins no anulados
   * en eventos del productor + payments PAID atribuibles (TICKET por
   * eventId; SERIES_PASS por seriesId→EventSeries.producerId).
   * Señales: eventsRecent (ventana), eventStreak (eventos pasados
   * consecutivos asistidos), monthsContinuous (checkin o compra),
   * purchases (ventana), earlyPurchases (≥early_days antes del evento),
   * dropping (0 de los últimos 2 eventos tras ≥2 de los 5 anteriores).
   */
  private async computeProducerActivity(
    actorId: string,
    p: ScoreParams,
    activity: Map<string, PersonActivity>,
    touch: (personId: string, at: Date | null) => PersonActivity,
  ): Promise<void> {
    const now = new Date();
    // Ventana de score para eventos recientes (no confundir con el fetch
    // completo de checkins - es histórico para tenure/meses).
    const recentSince = new Date(
      now.getTime() - p.attendanceWeeks * 7 * DAY_MS,
    );
    const purchaseSince = new Date(
      now.getTime() - p.purchaseMonths * 31 * DAY_MS,
    );
    const earlyCutoff = p.earlyDays * DAY_MS;

    // Solo eventos reales (publicados en adelante): DRAFT/CANCELLED no
    // rompen rachas ni cuentan como evento perdido.
    const events = await this.prisma.event.findMany({
      where: {
        producerId: actorId,
        status: { in: ["PUBLISHED", "LIVE", "CLOSED"] },
      },
      select: { id: true, startsAt: true },
      orderBy: { startsAt: "desc" },
    });
    const eventIds = events.map((e) => e.id);
    if (!eventIds.length) return;
    const eventStart = new Map(events.map((e) => [e.id, e.startsAt]));
    // Eventos ya pasados, más reciente primero (para racha y caída).
    const pastEvents = events.filter((e) => e.startsAt <= now);

    const [checkins, ticketPayments, seriesPassPayments] = await Promise.all([
      this.prisma.checkin.findMany({
        where: { eventId: { in: eventIds }, voidedAt: null },
        select: { personId: true, eventId: true, inAt: true },
      }),
      this.prisma.payment.findMany({
        where: {
          status: "PAID",
          orderType: "TICKET",
          eventId: { in: eventIds },
        },
        select: {
          personId: true,
          eventId: true,
          amount: true,
          createdAt: true,
        },
      }),
      // SERIES_PASS no tiene columna - el refId codifica la serie.
      this.prisma.payment.findMany({
        where: { status: "PAID", orderType: "SERIES_PASS" },
        select: { personId: true, amount: true, createdAt: true, refId: true },
      }),
    ]);

    // Series del productor → ids válidos para atribuir passes.
    const seriesRefIds = seriesPassPayments
      .map((pmt) => decodeSeriesPassRef(pmt.refId)?.seriesId)
      .filter((s): s is string => !!s);
    const producerSeries = seriesRefIds.length
      ? await this.prisma.eventSeries.findMany({
          where: { id: { in: seriesRefIds }, producerId: actorId },
          select: { id: true },
        })
      : [];
    const ownedSeries = new Set(producerSeries.map((s) => s.id));

    const monthsActivity = new Map<string, Set<number>>();
    const attendedEvents = new Map<string, Set<string>>();
    const bumpMonth = (pid: string, at: Date) => {
      const set =
        monthsActivity.get(pid) ??
        monthsActivity.set(pid, new Set()).get(pid)!;
      set.add(monthIndex(at));
    };

    for (const c of checkins) {
      const a = touch(c.personId, c.inAt);
      a.attendance++;
      if (c.inAt >= recentSince) a.attendanceRecent++;
      bumpMonth(c.personId, c.inAt);
      (attendedEvents.get(c.personId) ??
        attendedEvents.set(c.personId, new Set()).get(c.personId)!).add(
        c.eventId,
      );
    }
    for (const pmt of ticketPayments) {
      const a = touch(pmt.personId, pmt.createdAt);
      a.spend += pmt.amount;
      bumpMonth(pmt.personId, pmt.createdAt);
      if (pmt.createdAt >= purchaseSince) a.purchases++;
      const start = pmt.eventId ? eventStart.get(pmt.eventId) : undefined;
      if (start && pmt.createdAt.getTime() <= start.getTime() - earlyCutoff) {
        a.earlyPurchases++;
      }
    }
    for (const pmt of seriesPassPayments) {
      const sid = decodeSeriesPassRef(pmt.refId)?.seriesId;
      if (!sid || !ownedSeries.has(sid)) continue;
      const a = touch(pmt.personId, pmt.createdAt);
      a.spend += pmt.amount;
      bumpMonth(pmt.personId, pmt.createdAt);
      if (pmt.createdAt >= purchaseSince) a.purchases++;
    }

    const curMonth = monthIndex(now);
    for (const [pid, a] of activity) {
      a.tenureMonths = a.firstAt
        ? Math.max(1, monthIndex(now) - monthIndex(a.firstAt) + 1)
        : 0;
      // Racha de eventos: consecutivos desde el más reciente hacia atrás.
      const attended = attendedEvents.get(pid);
      if (attended) {
        let streak = 0;
        for (const ev of pastEvents) {
          if (attended.has(ev.id)) streak++;
          else break;
        }
        a.weeklyStreak = streak; // semántica eventStreak para PRODUCER
        // Caída: 0 de los últimos 2 eventos tras ≥2 de los 5 anteriores.
        if (pastEvents.length >= 3) {
          const last2 = pastEvents.slice(0, 2);
          const prev5 = pastEvents.slice(2, 7);
          const inLast2 = last2.filter((e) => attended.has(e.id)).length;
          const inPrev5 = prev5.filter((e) => attended.has(e.id)).length;
          a.dropping = inLast2 === 0 && inPrev5 >= 2;
        }
      }
      const mset = monthsActivity.get(pid);
      if (mset?.size) {
        let m = mset.has(curMonth) ? curMonth : curMonth - 1;
        while (mset.has(m)) {
          a.monthsContinuous++;
          m--;
        }
      }
    }
  }

  /**
   * Universo ACADEMY: enrollments + attendances en clases de sus slots +
   * compras (Payment PAID por refId mem_/wks_/pvt_/claim- + PaymentClaim
   * APPROVED) + membresías vigentes para meses continuos.
   */
  private async computeAcademyActivity(
    actorId: string,
    p: ScoreParams,
    activity: Map<string, PersonActivity>,
    touch: (personId: string, at: Date | null) => PersonActivity,
  ): Promise<void> {
    const now = new Date();
    // Ventana de asistencias: la más larga de las ventanas que alimenta
    // el score (semanas de recencia, meses continuos +1 de margen).
    const attendanceSince = new Date(
      now.getTime() - Math.max(p.attendanceWeeks * 7, (p.monthsCap + 1) * 31) *
        DAY_MS,
    );
    const purchaseSince = new Date(
      now.getTime() - p.purchaseMonths * 31 * DAY_MS,
    );

    const enrollments = await this.prisma.enrollment.findMany({
      where: { academyId: actorId },
      select: {
        personId: true,
        startedAt: true,
        endsAt: true,
        pausedAt: true,
        createdAt: true,
      },
    });
    const personIds = [...new Set(enrollments.map((e) => e.personId))];
    if (!personIds.length) return;

    const [attTotal, attWindow, memberships, payments, claims] =
      await Promise.all([
        // Totales históricos (count + último) - alimentan attendance y lastAt.
        this.prisma.attendance.groupBy({
          by: ["personId"],
          where: {
            personId: { in: personIds },
            class: { slot: { academyId: actorId } },
          },
          _count: { _all: true },
          _min: { checkedAt: true },
          _max: { checkedAt: true },
        }),
        // checkedAt en ventana → señales de recencia/racha/meses.
        this.prisma.attendance.findMany({
          where: {
            personId: { in: personIds },
            checkedAt: { gte: attendanceSince },
            class: { slot: { academyId: actorId } },
          },
          select: { personId: true, checkedAt: true },
        }),
        // Membresías para "mes continuo": ACTIVE/CANCEL_PENDING cubren
        // [createdAt, canceledAt ?? now] (sin histórico - aproximación
        // por ventana, mismo criterio que activeStudentsMonthPrev).
        this.prisma.membershipSubscription.findMany({
          where: {
            academyId: actorId,
            personId: { in: personIds },
            status: { in: ["ACTIVE", "CANCEL_PENDING"] },
          },
          select: { personId: true, createdAt: true, canceledAt: true },
        }),
        // Compras por pasarela/manual atribuibles por refId.
        this.prisma.payment.findMany({
          where: {
            personId: { in: personIds },
            status: "PAID",
            orderType: { in: ["MEMBERSHIP", "WORKSHOP", "PRIVATE"] },
          },
          select: {
            personId: true,
            amount: true,
            createdAt: true,
            orderType: true,
            refId: true,
          },
        }),
        // Claims manuales aprobados (orden MANUAL - el claim es el hecho).
        this.prisma.paymentClaim.findMany({
          where: { academyId: actorId, status: "APPROVED" },
          select: { personId: true, amount: true, reviewedAt: true },
        }),
      ]);

    for (const e of enrollments) {
      touch(e.personId, e.startedAt ?? e.createdAt);
      const a = activity.get(e.personId)!;
      const start = e.startedAt ?? e.createdAt;
      a.tenureMonths = Math.max(
        a.tenureMonths,
        monthIndex(now) - monthIndex(start) + 1,
      );
    }
    for (const t of attTotal) {
      const a = touch(t.personId, t._max.checkedAt);
      a.attendance = t._count._all;
      if (t._min.checkedAt) touch(t.personId, t._min.checkedAt);
    }

    // ── Señales por ventana de asistencia ──
    const recentSince = now.getTime() - p.attendanceWeeks * 7 * DAY_MS;
    const prev4Start = now.getTime() - 8 * 7 * DAY_MS;
    const recent4Start = now.getTime() - 4 * 7 * DAY_MS;
    const weeks = new Map<string, Set<number>>();
    const monthsAttended = new Map<string, Set<number>>();
    for (const at of attWindow) {
      const a = touch(at.personId, at.checkedAt);
      const ms = at.checkedAt.getTime();
      if (ms >= recentSince) a.attendanceRecent++;
      if (ms >= recent4Start) a.attendanceRecent4w++;
      else if (ms >= prev4Start) a.attendancePrev4w++;
      const wk = weekIndex(at.checkedAt);
      (weeks.get(at.personId) ?? weeks.set(at.personId, new Set()).get(at.personId)!).add(wk);
      const mk = monthIndex(at.checkedAt);
      (monthsAttended.get(at.personId) ?? monthsAttended.set(at.personId, new Set()).get(at.personId)!).add(mk);
    }

    // Meses con membresía vigente: enrollment [startedAt, endsAt|pausedAt|now]
    // + suscripción ACTIVE [createdAt, canceledAt|now].
    const monthsCovered = new Map<string, Set<number>>();
    const coverRange = (
      personId: string,
      from: Date,
      to: Date,
      map: Map<string, Set<number>>,
    ) => {
      const set = map.get(personId) ?? map.set(personId, new Set()).get(personId)!;
      // Solo meses dentro de la ventana del score + 1 de margen.
      const first = Math.max(monthIndex(from), monthIndex(now) - (p.monthsCap + 1));
      const last = monthIndex(to > now ? now : to);
      for (let m = first; m <= last; m++) set.add(m);
    };
    for (const e of enrollments) {
      const from = e.startedAt ?? e.createdAt;
      const to = e.endsAt ?? e.pausedAt ?? now;
      coverRange(e.personId, from, to, monthsCovered);
    }
    for (const s of memberships) {
      coverRange(s.personId, s.createdAt, s.canceledAt ?? now, monthsCovered);
    }

    const curWeek = weekIndex(now);
    const curMonth = monthIndex(now);
    for (const pid of personIds) {
      const a = activity.get(pid);
      if (!a) continue;
      // Racha semanal: desde la semana actual (si ya asistió) o la
      // anterior, hacia atrás mientras haya asistencia.
      const wset = weeks.get(pid);
      if (wset) {
        let w = wset.has(curWeek) ? curWeek : curWeek - 1;
        while (wset.has(w)) {
          a.weeklyStreak++;
          w--;
        }
      }
      // Meses continuos: unión asistencia ∪ membresía; desde el mes
      // actual (si ya está cubierto) o el anterior.
      const mset = new Set([
        ...(monthsAttended.get(pid) ?? []),
        ...(monthsCovered.get(pid) ?? []),
      ]);
      if (mset.size) {
        let m = mset.has(curMonth) ? curMonth : curMonth - 1;
        while (mset.has(m)) {
          a.monthsContinuous++;
          m--;
        }
      }
      // Caída: ventana reciente perdió ≥50% vs la anterior (mínimo 2
      // previas para no marcar sobre base ~0).
      a.dropping =
        a.attendancePrev4w >= 2 && a.attendanceRecent4w < a.attendancePrev4w / 2;
    }

    // ── Compras: resolución por refId (patrón de cobros/kpis) ──
    // Nota: los Payments MANUAL de claims (`refId=claim-<id>`) se excluyen
    // aquí a propósito - esa compra la cuenta el bloque de PaymentClaim
    // (evita doble conteo claim + payment materializado).
    const planIds: string[] = [];
    const classIds: string[] = [];
    for (const pmt of payments) {
      if (pmt.orderType === "MEMBERSHIP" && pmt.refId.startsWith("mem_")) {
        planIds.push(decodeMembershipRef(pmt.refId)?.planId ?? "");
      } else if (pmt.orderType === "WORKSHOP" && pmt.refId.startsWith("wks_")) {
        classIds.push(decodeClassRef(pmt.refId)?.classId ?? "");
      } else if (pmt.orderType === "PRIVATE" && pmt.refId.startsWith("pvt_")) {
        const acad = decodePrivateRef(pmt.refId)?.academyId;
        if (acad === actorId) {
          const a = touch(pmt.personId, pmt.createdAt);
          if (pmt.createdAt >= purchaseSince) a.purchases++;
          a.spend += pmt.amount;
        }
      }
    }
    const [academyPlans, academyClasses] = await Promise.all([
      planIds.length
        ? this.prisma.membershipPlan.findMany({
            where: { id: { in: planIds }, academyId: actorId },
            select: { id: true },
          })
        : Promise.resolve([]),
      classIds.length
        ? this.prisma.class.findMany({
            where: {
              id: { in: classIds },
              slot: { academyId: actorId },
            },
            select: { id: true },
          })
        : Promise.resolve([]),
    ]);
    const ownedPlans = new Set(academyPlans.map((r) => r.id));
    const ownedClasses = new Set(academyClasses.map((r) => r.id));

    for (const pmt of payments) {
      let owned = false;
      if (pmt.orderType === "MEMBERSHIP" && pmt.refId.startsWith("mem_")) {
        owned = ownedPlans.has(decodeMembershipRef(pmt.refId)?.planId ?? "");
      } else if (pmt.orderType === "WORKSHOP" && pmt.refId.startsWith("wks_")) {
        owned = ownedClasses.has(decodeClassRef(pmt.refId)?.classId ?? "");
      }
      if (!owned) continue;
      const a = touch(pmt.personId, pmt.createdAt);
      a.spend += pmt.amount;
      if (pmt.createdAt >= purchaseSince) a.purchases++;
    }
    for (const c of claims) {
      const a = touch(c.personId, c.reviewedAt);
      a.spend += c.amount;
      if (c.reviewedAt && c.reviewedAt >= purchaseSince) a.purchases++;
    }
  }

  // ═══════════════════ CAMPAIGNS ═══════════════════

  async createCampaign(
    actorType: string,
    actorId: string,
    name: string,
    segment: unknown,
    action: unknown,
    scheduledAt?: string | null,
  ) {
    const parsedSegment = await this.parseSegment(segment, actorType, actorId);
    const parsedAction = this.parseAction(action);
    let schedule: Date | null = null;
    if (scheduledAt) {
      const d = new Date(scheduledAt);
      if (Number.isNaN(d.getTime())) {
        throw new CrmDomainError("BAD_REQUEST", "scheduledAt inválido");
      }
      if (d.getTime() <= Date.now()) {
        throw new CrmDomainError(
          "BAD_REQUEST",
          "scheduledAt debe ser una fecha futura",
        );
      }
      schedule = d;
    }
    return this.prisma.campaign.create({
      data: {
        actorType,
        actorId,
        name,
        segment: parsedSegment as Prisma.InputJsonValue,
        action: parsedAction as Prisma.InputJsonValue,
        status: schedule ? "SCHEDULED" : "DRAFT",
        scheduledAt: schedule,
      },
    });
  }

  /** Desprograma una campaña: SCHEDULED → DRAFT (spec crm-campaign-ops). */
  async cancelCampaign(id: string) {
    const campaign = await this.prisma.campaign.findUnique({ where: { id } });
    if (!campaign) {
      throw new CrmDomainError("NOT_FOUND", "campaña no encontrada");
    }
    if (campaign.status !== "SCHEDULED") {
      throw new CrmDomainError(
        "CONFLICT",
        "solo se puede desprogramar una campaña SCHEDULED",
      );
    }
    return this.prisma.campaign.update({
      where: { id },
      data: { status: "DRAFT", scheduledAt: null },
    });
  }

  /**
   * Handler del job `crm.campaigns` (cada 5 min): envía las campañas
   * SCHEDULED con scheduledAt vencido. Devuelve conteo para JobRun.meta.
   */
  async sendScheduledCampaigns(): Promise<{ sent: number }> {
    const due = await this.prisma.campaign.findMany({
      where: { status: "SCHEDULED", scheduledAt: { lte: new Date() } },
      select: { id: true },
    });
    let sent = 0;
    for (const c of due) {
      try {
        await this.sendCampaign(c.id);
        sent++;
      } catch (e) {
        this.logger.error(
          `crm.campaigns: sendCampaign ${c.id} falló`,
          e instanceof Error ? e.stack : String(e),
        );
      }
    }
    return { sent };
  }

  getCampaign(id: string) {
    return this.prisma.campaign.findUnique({ where: { id } });
  }

  async listCampaigns(
    actorType: string,
    actorId: string,
    pg?: { page: number; pageSize: number; skip: number; take: number },
  ) {
    const where = { actorType, actorId };
    const [items, total] = await Promise.all([
      this.prisma.campaign.findMany({
        where,
        orderBy: { createdAt: "desc" },
        ...(pg ? { skip: pg.skip, take: pg.take } : {}),
      }),
      this.prisma.campaign.count({ where }),
    ]);
    return {
      items,
      total,
      page: pg?.page ?? 1,
      pageSize: pg?.pageSize ?? total,
    };
  }

  /**
   * Envía una campaña DRAFT: resuelve el segmento (unión de personIds/tags/
   * segment), ejecuta la acción (NOTIFY → notifySafe por persona;
   * DISCOUNT_CODE → crea DiscountCode CAMPAIGN + notify con el código) y
   * marca SENT con result {sent, code?, at}.
   */
  async sendCampaign(id: string): Promise<Campaign> {
    const campaign = await this.prisma.campaign.findUnique({ where: { id } });
    if (!campaign) {
      throw new CrmDomainError("NOT_FOUND", "campaña no encontrada");
    }
    if (campaign.status !== "DRAFT" && campaign.status !== "SCHEDULED") {
      throw new CrmDomainError("CONFLICT", "la campaña ya fue enviada");
    }

    const segment = await this.parseSegment(
      campaign.segment,
      campaign.actorType,
      campaign.actorId,
    );
    const action = this.parseAction(campaign.action);
    const personIds = await this.resolveSegment(
      campaign.actorType,
      campaign.actorId,
      segment,
    );

    let code: string | undefined;
    if (action.type === "DISCOUNT_CODE") {
      code = await this.createCampaignCode(campaign, action);
    }

    for (const personId of personIds) {
      const isDiscount = action.type === "DISCOUNT_CODE";
      await this.notifications.notifySafe(personId, {
        category: "MARKETING",
        type: "crm.campaign",
        title: isDiscount ? campaign.name : action.title,
        body: isDiscount
          ? `Tu código de descuento: ${code}`
          : action.body,
        data: {
          campaignId: campaign.id,
          ...(code ? { code } : {}),
        },
      });
    }

    return this.prisma.campaign.update({
      where: { id },
      data: {
        status: "SENT",
        scheduledAt: null,
        result: {
          sent: personIds.length,
          ...(code ? { code } : {}),
          // Audiencia materializada al enviar - base de la atribución
          // (spec crm-campaign-ops): engaged/redemptions en la ficha.
          audienceIds: personIds,
          at: new Date().toISOString(),
        },
      },
    });
  }

  /**
   * Atribución de la campaña (spec crm-campaign-ops): sobre
   * result.audienceIds cuenta redenciones del código (DISCOUNT_CODE) y
   * personas que volvieron a la actividad del actor tras el envío
   * (checkin en eventos del producer / attendance en clases de la
   * academia). Se calcula bajo demanda en la ficha.
   */
  async campaignMetrics(id: string): Promise<{
    sent: number;
    redemptions: number | null;
    engaged: number | null;
  }> {
    const campaign = await this.prisma.campaign.findUnique({ where: { id } });
    if (!campaign) {
      throw new CrmDomainError("NOT_FOUND", "campaña no encontrada");
    }
    const result = (campaign.result ?? {}) as Record<string, unknown>;
    const audience = Array.isArray(result.audienceIds)
      ? (result.audienceIds as string[])
      : [];
    const sentAt = result.at ? new Date(String(result.at)) : null;

    let redemptions: number | null = null;
    const code =
      typeof result.code === "string" ? result.code : null;
    if (code && sentAt) {
      const dc = await this.prisma.discountCode.findUnique({
        where: { code },
        select: { id: true },
      });
      if (dc) {
        redemptions = await this.prisma.payment.count({
          where: {
            discountCodeId: dc.id,
            status: "PAID",
            createdAt: { gte: sentAt },
          },
        });
      } else {
        redemptions = 0;
      }
    }

    let engaged: number | null = null;
    if (sentAt && audience.length) {
      if (campaign.actorType === "ACADEMY") {
        const rows = await this.prisma.attendance.findMany({
          where: {
            personId: { in: audience },
            checkedAt: { gte: sentAt },
            class: { slot: { academyId: campaign.actorId } },
          },
          select: { personId: true },
          distinct: ["personId"],
        });
        engaged = rows.length;
      } else if (campaign.actorType === "PRODUCER") {
        const events = await this.prisma.event.findMany({
          where: { producerId: campaign.actorId },
          select: { id: true },
        });
        const eventIds = events.map((e) => e.id);
        if (eventIds.length) {
          const rows = await this.prisma.checkin.findMany({
            where: {
              personId: { in: audience },
              inAt: { gte: sentAt },
              voidedAt: null,
              eventId: { in: eventIds },
            },
            select: { personId: true },
            distinct: ["personId"],
          });
          engaged = rows.length;
        } else {
          engaged = 0;
        }
      }
    }

    return {
      sent: Number(result.sent ?? 0),
      redemptions,
      engaged,
    };
  }

  /**
   * Links wa.me de la audiencia de la campaña (spec
   * crm-channels-digest): SENT usa result.audienceIds persistida;
   * DRAFT/SCHEDULED resuelve la audiencia al vuelo. Solo personas con
   * phone registrado; el resto queda en withoutPhone.
   */
  async whatsappLinks(
    id: string,
    text?: string,
  ): Promise<{
    items: { personId: string; name: string; phone: string; url: string }[];
    total: number;
    withoutPhone: number;
  }> {
    const campaign = await this.prisma.campaign.findUnique({ where: { id } });
    if (!campaign) {
      throw new CrmDomainError("NOT_FOUND", "campaña no encontrada");
    }
    const result = (campaign.result ?? {}) as Record<string, unknown>;
    let audience = Array.isArray(result.audienceIds)
      ? (result.audienceIds as string[])
      : null;
    if (!audience) {
      const segment = await this.parseSegment(
        campaign.segment,
        campaign.actorType,
        campaign.actorId,
      );
      audience = await this.resolveSegment(
        campaign.actorType,
        campaign.actorId,
        segment,
      );
    }
    const people = await this.prisma.person.findMany({
      where: { id: { in: audience } },
      select: { id: true, name: true, phone: true },
    });
    const encoded = text?.trim() ? encodeURIComponent(text.trim()) : "";
    const items = people
      .filter((p) => p.phone)
      .map((p) => {
        const digits = String(p.phone).replace(/\D/g, "");
        return {
          personId: p.id,
          name: p.name ?? p.id,
          phone: String(p.phone),
          url: `https://wa.me/${digits}${encoded ? `?text=${encoded}` : ""}`,
        };
      });
    return {
      items,
      total: people.length,
      withoutPhone: people.length - items.length,
    };
  }

  /**
   * Handler del job `crm.digest` (spec crm-channels-digest, lunes
   * 09:00): una notificación al owner de cada actor con universo, con
   * total y conteos por segmento del RelationshipScore.
   */
  async sendDigests(): Promise<{ actors: number; notified: number }> {
    const actors = await this.prisma.relationshipScore.groupBy({
      by: ["actorType", "actorId"],
    });
    let notified = 0;
    for (const a of actors) {
      const ownerId = await this.actorOwnerId(a.actorType, a.actorId);
      if (!ownerId) continue;
      const rows = await this.prisma.relationshipScore.findMany({
        where: { actorType: a.actorType, actorId: a.actorId },
        select: { segment: true },
      });
      const counts: Record<string, number> = {};
      for (const r of rows) {
        counts[r.segment ?? "NONE"] = (counts[r.segment ?? "NONE"] ?? 0) + 1;
      }
      const parts = [
        `${rows.length} personas`,
        counts.CORE ? `${counts.CORE} núcleo` : null,
        counts.AT_RISK ? `${counts.AT_RISK} en riesgo` : null,
        counts.NEW ? `${counts.NEW} nuevas` : null,
        counts.BRINGS_PEOPLE ? `${counts.BRINGS_PEOPLE} trae gente` : null,
      ].filter(Boolean);
      await this.notifications.notifySafe(ownerId, {
        category: "OPERATIONAL",
        type: "crm.digest",
        title: "Resumen semanal de tu CRM",
        body: parts.join(" · "),
        data: {
          actorType: a.actorType,
          actorId: a.actorId,
          total: rows.length,
          counts,
        },
      });
      notified++;
    }
    return { actors: actors.length, notified };
  }

  /** Resuelve el segmento a personIds - unión de los criterios presentes. */
  private async resolveSegment(
    actorType: string,
    actorId: string,
    segment: CampaignSegment,
  ): Promise<string[]> {
    const ids = new Set<string>();

    // personIds solo alcanza dentro del universo del actor (score ∪ tag;
    // ACADEMY además enrollment ∪ booking) - un id ajeno se descarta sin
    // error. Sin esto, cualquier personId conocido era notificable.
    if (segment.personIds?.length) {
      const universeQueries: Promise<Array<{ personId: string }>>[] = [
        this.prisma.relationshipScore.findMany({
          where: { actorType, actorId },
          select: { personId: true },
        }),
        this.prisma.actorTag.findMany({
          where: { actorType, actorId },
          select: { personId: true },
        }),
      ];
      if (actorType === "ACADEMY") {
        universeQueries.push(
          this.prisma.enrollment.findMany({
            where: { academyId: actorId },
            select: { personId: true },
          }),
          this.prisma.classBooking.findMany({
            where: { class: { slot: { academyId: actorId } } },
            select: { personId: true },
          }),
        );
      }
      const universe = new Set(
        (await Promise.all(universeQueries))
          .flat()
          .map((r) => r.personId),
      );
      for (const id of segment.personIds) {
        if (universe.has(id)) ids.add(id);
      }
    }

    if (segment.tags?.length) {
      const tags = await this.prisma.actorTag.findMany({
        where: { actorType, actorId, tag: { in: segment.tags } },
        select: { personId: true },
      });
      for (const t of tags) ids.add(t.personId);
    }

    if (segment.segment) {
      const scores = await this.prisma.relationshipScore.findMany({
        where: { actorType, actorId, segment: segment.segment },
        select: { personId: true },
      });
      for (const s of scores) ids.add(s.personId);
    }

    // Segmento guardado (spec crm-dynamic-segments): la membresía
    // materializada en el último recompute entra al OR de la audiencia.
    if (segment.segmentRef) {
      const seg = await this.prisma.actorSegment.findFirst({
        where: { id: segment.segmentRef, actorType, actorId },
        select: { id: true },
      });
      if (!seg) {
        throw new CrmDomainError("BAD_REQUEST", "segmentRef no existe");
      }
      const members = await this.prisma.actorSegmentMembership.findMany({
        where: { segmentId: seg.id },
        select: { personId: true },
      });
      for (const m of members) ids.add(m.personId);
    }

    // Criterios de academia (OR entre sí y con el resto) - parseSegment
    // garantiza que solo llegan con actorType ACADEMY.
    const academyQueries: Promise<Array<{ personId: string }>>[] = [];
    if (segment.allStudents) {
      academyQueries.push(
        this.prisma.enrollment.findMany({
          where: { academyId: actorId },
          select: { personId: true },
        }),
      );
    }
    if (segment.enrollmentStatus?.length) {
      academyQueries.push(
        this.prisma.enrollment.findMany({
          where: {
            academyId: actorId,
            status: { in: segment.enrollmentStatus as EnrollmentStatus[] },
          },
          select: { personId: true },
        }),
      );
    }
    if (segment.planId) {
      academyQueries.push(
        this.prisma.enrollment.findMany({
          where: { academyId: actorId, planId: segment.planId },
          select: { personId: true },
        }),
      );
    }
    if (segment.seriesId) {
      academyQueries.push(
        this.prisma.classBooking.findMany({
          where: {
            status: { not: "CANCELLED" },
            class: {
              slot: { seriesId: segment.seriesId, academyId: actorId },
            },
          },
          select: { personId: true },
        }),
      );
    }
    for (const rows of await Promise.all(academyQueries)) {
      for (const r of rows) ids.add(r.personId);
    }

    return [...ids];
  }

  /**
   * Preview de audiencia: resuelve el segmento a un conteo sin crear
   * campaña ni notificar (lo usa el form de campañas en vivo).
   */
  async previewCampaign(
    actorType: string,
    actorId: string,
    segment: unknown,
  ): Promise<{ count: number }> {
    const parsed = await this.parseSegment(segment, actorType, actorId);
    const resolved = await this.resolveSegment(actorType, actorId, parsed);
    return { count: resolved.length };
  }

  private async createCampaignCode(
    campaign: Campaign,
    action: Extract<CampaignAction, { type: "DISCOUNT_CODE" }>,
  ): Promise<string> {
    const code = `CMP-${randomBytes(4).toString("hex").toUpperCase()}`;
    const created = await this.prisma.discountCode.create({
      data: {
        code,
        type: "CAMPAIGN",
        createdById: campaign.actorId,
        percentOff: action.percentOff ?? null,
        amountOff: action.amountOff ?? null,
        maxUses: action.maxUses ?? null,
        expiresAt: action.expiresAt ? new Date(action.expiresAt) : null,
      },
    });
    return created.code;
  }

  private async parseSegment(
    raw: unknown,
    actorType: string,
    actorId: string,
  ): Promise<CampaignSegment> {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new CrmDomainError("BAD_REQUEST", "segment debe ser un objeto");
    }
    const s = raw as CampaignSegment;
    if (s.tags !== undefined && !this.isStringArray(s.tags)) {
      throw new CrmDomainError("BAD_REQUEST", "segment.tags debe ser string[]");
    }
    if (s.personIds !== undefined && !this.isStringArray(s.personIds)) {
      throw new CrmDomainError(
        "BAD_REQUEST",
        "segment.personIds debe ser string[]",
      );
    }
    if (s.segment !== undefined && typeof s.segment !== "string") {
      throw new CrmDomainError("BAD_REQUEST", "segment.segment debe ser string");
    }
    if (s.allStudents !== undefined && typeof s.allStudents !== "boolean") {
      throw new CrmDomainError(
        "BAD_REQUEST",
        "segment.allStudents debe ser boolean",
      );
    }
    if (s.enrollmentStatus !== undefined) {
      if (!this.isStringArray(s.enrollmentStatus)) {
        throw new CrmDomainError(
          "BAD_REQUEST",
          "segment.enrollmentStatus debe ser string[]",
        );
      }
      for (const st of s.enrollmentStatus) {
        if (!(ENROLLMENT_STATUSES as readonly string[]).includes(st)) {
          throw new CrmDomainError(
            "BAD_REQUEST",
            `enrollmentStatus inválido: ${st}`,
          );
        }
      }
    }
    if (s.planId !== undefined && typeof s.planId !== "string") {
      throw new CrmDomainError("BAD_REQUEST", "segment.planId debe ser string");
    }
    if (s.seriesId !== undefined && typeof s.seriesId !== "string") {
      throw new CrmDomainError(
        "BAD_REQUEST",
        "segment.seriesId debe ser string",
      );
    }

    // Los criterios de alumnos solo aplican a academias - el resto → 400.
    const hasAcademyCriteria =
      s.allStudents !== undefined ||
      s.enrollmentStatus !== undefined ||
      s.planId !== undefined ||
      s.seriesId !== undefined;
    if (hasAcademyCriteria && actorType !== "ACADEMY") {
      throw new CrmDomainError(
        "BAD_REQUEST",
        "los criterios de alumnos solo aplican a actorType ACADEMY",
      );
    }
    if (s.planId) {
      const plan = await this.prisma.membershipPlan.findFirst({
        where: { id: s.planId, academyId: actorId },
        select: { id: true },
      });
      if (!plan) {
        throw new CrmDomainError(
          "BAD_REQUEST",
          "planId no pertenece a la academia",
        );
      }
    }
    if (s.seriesId) {
      const series = await this.prisma.classSeries.findFirst({
        where: { id: s.seriesId, academyId: actorId },
        select: { id: true },
      });
      if (!series) {
        throw new CrmDomainError(
          "BAD_REQUEST",
          "seriesId no pertenece a la academia",
        );
      }
    }

    return {
      tags: s.tags,
      segment: s.segment,
      personIds: s.personIds,
      allStudents: s.allStudents,
      enrollmentStatus: s.enrollmentStatus,
      planId: s.planId,
      seriesId: s.seriesId,
      segmentRef: typeof s.segmentRef === "string" ? s.segmentRef : undefined,
    };
  }

  private parseAction(raw: unknown): CampaignAction {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new CrmDomainError("BAD_REQUEST", "action debe ser un objeto");
    }
    const a = raw as Record<string, unknown>;

    if (a.type === "NOTIFY") {
      if (typeof a.title !== "string" || !a.title.trim()) {
        throw new CrmDomainError(
          "BAD_REQUEST",
          "action NOTIFY requiere title",
        );
      }
      return {
        type: "NOTIFY",
        title: a.title,
        body: typeof a.body === "string" ? a.body : undefined,
      };
    }

    if (a.type === "DISCOUNT_CODE") {
      const percentOff = this.parseOptionalInt(a.percentOff, "percentOff");
      const amountOff = this.parseOptionalInt(a.amountOff, "amountOff");
      const maxUses = this.parseOptionalInt(a.maxUses, "maxUses");
      if (percentOff != null && (percentOff < 1 || percentOff > 100)) {
        throw new CrmDomainError(
          "BAD_REQUEST",
          "percentOff debe ser un entero entre 1 y 100",
        );
      }
      if (amountOff != null && amountOff <= 0) {
        throw new CrmDomainError(
          "BAD_REQUEST",
          "amountOff debe ser un entero positivo (CLP)",
        );
      }
      if (maxUses != null && maxUses < 1) {
        throw new CrmDomainError("BAD_REQUEST", "maxUses debe ser ≥ 1");
      }
      if (percentOff == null && amountOff == null) {
        throw new CrmDomainError(
          "BAD_REQUEST",
          "DISCOUNT_CODE requiere percentOff o amountOff",
        );
      }
      if (percentOff != null && amountOff != null) {
        throw new CrmDomainError(
          "BAD_REQUEST",
          "percentOff y amountOff son mutuamente excluyentes",
        );
      }
      const expiresAt =
        a.expiresAt !== undefined && a.expiresAt !== null
          ? new Date(String(a.expiresAt))
          : undefined;
      if (expiresAt && Number.isNaN(expiresAt.getTime())) {
        throw new CrmDomainError("BAD_REQUEST", "expiresAt inválido");
      }
      return {
        type: "DISCOUNT_CODE",
        percentOff: percentOff ?? undefined,
        amountOff: amountOff ?? undefined,
        maxUses: maxUses ?? undefined,
        expiresAt: expiresAt?.toISOString(),
      };
    }

    throw new CrmDomainError(
      "BAD_REQUEST",
      "action.type debe ser NOTIFY o DISCOUNT_CODE",
    );
  }

  private parseOptionalInt(
    v: unknown,
    field: string,
  ): number | null {
    if (v === undefined || v === null) return null;
    const n = Number(v);
    if (!Number.isInteger(n)) {
      throw new CrmDomainError("BAD_REQUEST", `${field} debe ser entero`);
    }
    return n;
  }

  private isStringArray(v: unknown): v is string[] {
    return Array.isArray(v) && v.every((x) => typeof x === "string");
  }

  // ═══════════════════ SEGMENTOS DINÁMICOS ═══════════════════
  // ActorSegment = regra nomeada do actor sobre as señales do score +
  // tags (spec crm-dynamic-segments). A membresía materializa em cada
  // recomputeScores; o diff (enter/exit) alimenta os triggers
  // SEGMENT_ENTER/SEGMENT_EXIT.

  /** Valida o payload `rules` de um ActorSegment. Forma:
   *  {match?: "all"|"any", conditions: [{field, op, value}]}. */
  parseSegmentRules(raw: unknown): {
    match: "all" | "any";
    conditions: { field: string; op: string; value: unknown }[];
  } {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new CrmDomainError("BAD_REQUEST", "rules debe ser un objeto");
    }
    const r = raw as Record<string, unknown>;
    const match = r.match === undefined ? "all" : r.match;
    if (match !== "all" && match !== "any") {
      throw new CrmDomainError("BAD_REQUEST", "rules.match debe ser all o any");
    }
    if (!Array.isArray(r.conditions) || !r.conditions.length) {
      throw new CrmDomainError(
        "BAD_REQUEST",
        "rules.conditions debe tener al menos una condición",
      );
    }
    const conditions = r.conditions.map((c, i) => {
      const cond = c as Record<string, unknown>;
      const field = String(cond?.field ?? "");
      const op = String(cond?.op ?? "");
      if (!SEGMENT_RULE_FIELDS.has(field)) {
        throw new CrmDomainError(
          "BAD_REQUEST",
          `conditions[${i}].field desconocido: ${field} - válidos: ${[...SEGMENT_RULE_FIELDS].join(", ")}`,
        );
      }
      const validOps = SEGMENT_RULE_OPS[field];
      if (!validOps.includes(op)) {
        throw new CrmDomainError(
          "BAD_REQUEST",
          `conditions[${i}].op inválida para ${field}: ${op} - válidas: ${validOps.join(", ")}`,
        );
      }
      if (cond.value === undefined || cond.value === null) {
        throw new CrmDomainError(
          "BAD_REQUEST",
          `conditions[${i}].value requerido`,
        );
      }
      return { field, op, value: cond.value };
    });
    return { match, conditions };
  }

  private evalSegmentRules(
    rules: { match: "all" | "any"; conditions: { field: string; op: string; value: unknown }[] },
    ctx: { a: PersonActivity; score: number; segment: string | null; tags: Set<string> },
  ): boolean {
    const fieldValue = (field: string): unknown => {
      switch (field) {
        case "score":
          return ctx.score;
        case "segment":
          return ctx.segment;
        case "attendanceRecent":
          return ctx.a.attendanceRecent;
        case "weeklyStreak":
          return ctx.a.weeklyStreak;
        case "monthsContinuous":
          return ctx.a.monthsContinuous;
        case "purchases":
          return ctx.a.purchases;
        case "earlyPurchases":
          return ctx.a.earlyPurchases;
        case "tenure":
          return ctx.a.tenureMonths;
        case "referrals":
          return ctx.a.referrals;
        case "spend":
          return ctx.a.spend;
        case "tag":
          return ctx.tags;
        default:
          return undefined;
      }
    };
    const test = (c: { field: string; op: string; value: unknown }): boolean => {
      const fv = fieldValue(c.field);
      if (c.field === "tag") {
        const has = (fv as Set<string>).has(String(c.value));
        return c.op === "present" ? has : !has;
      }
      if (c.field === "segment") {
        const eq = fv === String(c.value);
        return c.op === "eq" ? eq : !eq;
      }
      const n = Number(fv);
      const v = Number(c.value);
      switch (c.op) {
        case "eq":
          return n === v;
        case "neq":
          return n !== v;
        case "gt":
          return n > v;
        case "gte":
          return n >= v;
        case "lt":
          return n < v;
        case "lte":
          return n <= v;
        default:
          return false;
      }
    };
    return rules.match === "all"
      ? rules.conditions.every(test)
      : rules.conditions.some(test);
  }

  /**
   * Contexto de evaluación por persona: actividad + score/segment +
   * tags. Lo construye syncSegments tras un recompute y el preview lo
   * reutiliza desde RelationshipScore + ActorTag persistidos.
   */
  private segmentEvalCtx(
    personId: string,
    c: { a: PersonActivity; score: number; segment: string | null },
    tagsByPerson: Map<string, Set<string>>,
  ) {
    return {
      a: c.a,
      score: c.score,
      segment: c.segment,
      tags: tagsByPerson.get(personId) ?? new Set<string>(),
    };
  }

  /**
   * Recalcula las membresías de todos los ActorSegment del actor tras un
   * recompute de scores. Emite enter/exit a los triggers SEGMENT_ENTER/
   * SEGMENT_EXIT que referencien el segmento. Devuelve resumen por
   * segmento (miembros, entradas, salidas).
   */
  private async syncSegments(
    actorType: string,
    actorId: string,
    computed: Map<
      string,
      { a: PersonActivity; score: number; segment: string | null }
    >,
  ): Promise<Record<string, { members: number; entered: number; exited: number }>> {
    const segments = await this.prisma.actorSegment.findMany({
      where: { actorType, actorId },
    });
    const out: Record<string, { members: number; entered: number; exited: number }> = {};
    if (!segments.length) return out;

    const tagRows = await this.prisma.actorTag.findMany({
      where: { actorType, actorId },
      select: { personId: true, tag: true },
    });
    const tagsByPerson = new Map<string, Set<string>>();
    for (const t of tagRows) {
      (tagsByPerson.get(t.personId) ??
        tagsByPerson.set(t.personId, new Set()).get(t.personId)!).add(t.tag);
    }

    const triggers = (await this.prisma.crmTrigger.findMany({
      where: { actorType, actorId, active: true },
    })).filter((t) => EVENT_TRIGGER_KEYS.has(t.key));

    for (const seg of segments) {
      let rules: ReturnType<CrmService["parseSegmentRules"]>;
      try {
        rules = this.parseSegmentRules(seg.rules);
      } catch (e) {
        this.logger.warn(
          `ActorSegment ${seg.id} (${seg.name}) con rules inválidas - se ignora: ${e}`,
        );
        continue;
      }
      const want = new Set<string>();
      for (const [pid, c] of computed) {
        if (this.evalSegmentRules(rules, this.segmentEvalCtx(pid, c, tagsByPerson))) {
          want.add(pid);
        }
      }
      const current = new Set(
        (
          await this.prisma.actorSegmentMembership.findMany({
            where: { segmentId: seg.id },
            select: { personId: true },
          })
        ).map((m) => m.personId),
      );
      const entered = [...want].filter((p) => !current.has(p));
      const exited = [...current].filter((p) => !want.has(p));
      if (entered.length) {
        await this.prisma.actorSegmentMembership.createMany({
          data: entered.map((personId) => ({ segmentId: seg.id, personId })),
        });
      }
      if (exited.length) {
        await this.prisma.actorSegmentMembership.deleteMany({
          where: { segmentId: seg.id, personId: { in: exited } },
        });
      }
      for (const t of triggers) {
        const cfg = this.cfg(t);
        if (cfg.segmentId !== seg.id) continue;
        const direction = t.key === "SEGMENT_ENTER" ? "enter" : "exit";
        const people = direction === "enter" ? entered : exited;
        if (people.length) {
          await this.runSegmentTrigger(t, seg.name, seg.id, direction, people, actorType, actorId);
        }
      }
      out[seg.name] = {
        members: want.size,
        entered: entered.length,
        exited: exited.length,
      };
    }
    return out;
  }

  /**
   * Ejecuta la acción de un trigger SEGMENT_ENTER/SEGMENT_EXIT sobre las
   * personas que cambiaron de membresía. config.action:
   * {type:"NOTIFY",title,body?} | {type:"TAG_ADD"|"TAG_REMOVE",tag} |
   * {type:"NOTIFY_OWNER",title?,body?}.
   */
  private async runSegmentTrigger(
    t: CrmTrigger,
    segmentName: string,
    segmentId: string,
    direction: "enter" | "exit",
    personIds: string[],
    actorType: string,
    actorId: string,
  ): Promise<void> {
    const cfg = this.cfg(t);
    const action = (cfg.action ?? { type: "NOTIFY" }) as Record<string, unknown>;
    const type = String(action.type ?? "NOTIFY");

    if (type === "TAG_ADD" || type === "TAG_REMOVE") {
      const tag = String(action.tag ?? "").trim();
      if (!tag) return;
      for (const personId of personIds) {
        if (type === "TAG_ADD") {
          const exists = await this.prisma.actorTag.findFirst({
            where: { actorType, actorId, personId, tag },
          });
          if (!exists) {
            await this.prisma.actorTag.create({
              data: { actorType, actorId, personId, tag },
            });
          }
        } else {
          await this.prisma.actorTag.deleteMany({
            where: { actorType, actorId, personId, tag },
          });
        }
      }
      return;
    }

    if (type === "NOTIFY_OWNER") {
      const ownerId = await this.actorOwnerId(actorType, actorId);
      if (!ownerId) return;
      const title = String(action.title ?? `Movimiento en "${segmentName}"`);
      const body = String(
        action.body ??
          `${personIds.length} persona(s) ${direction === "enter" ? "entran a" : "salen de"} "${segmentName}".`,
      );
      const recent = await this.prisma.notification.findFirst({
        where: {
          personId: ownerId,
          type: `crm.segment.${direction}`,
          createdAt: { gte: new Date(Date.now() - DAY_MS) },
          data: { path: ["segmentId"], equals: segmentId },
        },
        select: { id: true },
      });
      if (!recent) {
        await this.notifications.notifySafe(ownerId, {
          category: "OPERATIONAL",
          type: `crm.segment.${direction}`,
          title,
          body,
          data: {
            segmentId,
            segmentName,
            direction,
            count: personIds.length,
            actorType,
            actorId,
            trigger: t.key,
          },
        });
      }
      return;
    }

    // NOTIFY (default): una notificación por persona, dedup por
    // (persona, segmento, dirección, día) — cooldown implícito de 1 día.
    for (const personId of personIds) {
      const recent = await this.prisma.notification.findFirst({
        where: {
          personId,
          type: `crm.segment.${direction}`,
          createdAt: { gte: new Date(Date.now() - DAY_MS) },
          data: { path: ["segmentId"], equals: segmentId },
        },
        select: { id: true },
      });
      if (recent) continue;
      await this.notifications.notifySafe(personId, {
        category: "MARKETING",
        type: `crm.segment.${direction}`,
        title: String(action.title ?? t.key),
        body: typeof action.body === "string" ? action.body : undefined,
        data: {
          segmentId,
          segmentName,
          direction,
          actorType,
          actorId,
          trigger: t.key,
        },
      });
    }
  }

  /** Owner del actor para NOTIFY_OWNER: ACADEMY → Academy.ownerId;
   *  PRODUCER (y demás) → el propio actorId (persona). */
  private async actorOwnerId(
    actorType: string,
    actorId: string,
  ): Promise<string | null> {
    if (actorType === "ACADEMY") {
      const ac = await this.prisma.academy.findUnique({
        where: { id: actorId },
        select: { ownerId: true },
      });
      return ac?.ownerId ?? null;
    }
    return actorId;
  }

  // ─── CRUD de segmentos ───

  async listSegments(actorType: string, actorId: string) {
    const segs = await this.prisma.actorSegment.findMany({
      where: { actorType, actorId },
      orderBy: { createdAt: "asc" },
      include: { _count: { select: { members: true } } },
    });
    return segs.map((s) => ({
      id: s.id,
      actorType: s.actorType,
      actorId: s.actorId,
      name: s.name,
      rules: s.rules,
      members: s._count.members,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    }));
  }

  async createSegment(
    actorType: string,
    actorId: string,
    name: string,
    rules: unknown,
  ) {
    const parsed = this.parseSegmentRules(rules);
    const trimmed = name.trim();
    if (!trimmed) {
      throw new CrmDomainError("BAD_REQUEST", "name requerido");
    }
    const dup = await this.prisma.actorSegment.findFirst({
      where: { actorType, actorId, name: trimmed },
    });
    if (dup) {
      throw new CrmDomainError("CONFLICT", `ya existe el segmento "${trimmed}"`);
    }
    const seg = await this.prisma.actorSegment.create({
      data: {
        actorType,
        actorId,
        name: trimmed,
        rules: parsed as unknown as Prisma.InputJsonValue,
      },
    });
    return seg;
  }

  async patchSegment(
    id: string,
    patch: { name?: string; rules?: unknown },
  ) {
    const seg = await this.prisma.actorSegment.findUnique({ where: { id } });
    if (!seg) {
      throw new CrmDomainError("NOT_FOUND", "segmento no encontrado");
    }
    const data: Prisma.ActorSegmentUpdateInput = {};
    if (patch.name !== undefined) {
      const trimmed = patch.name.trim();
      if (!trimmed) {
        throw new CrmDomainError("BAD_REQUEST", "name vacío");
      }
      const dup = await this.prisma.actorSegment.findFirst({
        where: {
          actorType: seg.actorType,
          actorId: seg.actorId,
          name: trimmed,
          NOT: { id },
        },
      });
      if (dup) {
        throw new CrmDomainError("CONFLICT", `ya existe el segmento "${trimmed}"`);
      }
      data.name = trimmed;
    }
    if (patch.rules !== undefined) {
      data.rules = this.parseSegmentRules(patch.rules) as unknown as Prisma.InputJsonValue;
    }
    return this.prisma.actorSegment.update({ where: { id }, data });
  }

  async getSegment(id: string) {
    return this.prisma.actorSegment.findUnique({ where: { id } });
  }

  segmentMembersCount(id: string) {
    return this.prisma.actorSegmentMembership.count({
      where: { segmentId: id },
    });
  }

  async deleteSegment(id: string): Promise<void> {
    await this.prisma.actorSegment.delete({ where: { id } });
  }

  /** Miembros materializados del segmento + join person. */
  async segmentPeople(id: string) {
    const members = await this.prisma.actorSegmentMembership.findMany({
      where: { segmentId: id },
      orderBy: { since: "desc" },
    });
    const people = await this.prisma.person.findMany({
      where: { id: { in: members.map((m) => m.personId) } },
      select: { id: true, name: true, photoUrl: true },
    });
    const personById = new Map(people.map((p) => [p.id, p]));
    return {
      total: members.length,
      items: members.map((m) => ({
        personId: m.personId,
        since: m.since,
        person: personById.get(m.personId) ?? null,
      })),
    };
  }

  /**
   * Preview de reglas sin persistir: evalúa contra los
   * RelationshipScore/breakdown persistidos (último recompute) + tags.
   */
  async previewSegmentRules(
    actorType: string,
    actorId: string,
    rulesRaw: unknown,
  ): Promise<{ count: number; sample: string[] }> {
    const rules = this.parseSegmentRules(rulesRaw);
    const [scores, tagRows] = await Promise.all([
      this.prisma.relationshipScore.findMany({
        where: { actorType, actorId },
      }),
      this.prisma.actorTag.findMany({
        where: { actorType, actorId },
        select: { personId: true, tag: true },
      }),
    ]);
    const tagsByPerson = new Map<string, Set<string>>();
    for (const t of tagRows) {
      (tagsByPerson.get(t.personId) ??
        tagsByPerson.set(t.personId, new Set()).get(t.personId)!).add(t.tag);
    }
    const matches: string[] = [];
    for (const s of scores) {
      const bd = (s.breakdown ?? {}) as Record<string, unknown>;
      const a = {
        attendance: 0,
        spend: Number(bd.spend ?? 0),
        referrals: Number(bd.referrals ?? 0),
        firstAt: null,
        lastAt: null,
        attendanceRecent: Number(bd.attendanceRecent ?? bd.eventsRecent ?? 0),
        attendanceRecent4w: 0,
        attendancePrev4w: 0,
        weeklyStreak: Number(bd.weeklyStreak ?? bd.eventStreak ?? 0),
        monthsContinuous: Number(bd.monthsContinuous ?? 0),
        purchases: Number(bd.purchases ?? 0),
        tenureMonths: Number(bd.tenure ?? 0),
        earlyPurchases: Number(bd.earlyPurchases ?? 0),
        dropping: false,
      } as PersonActivity;
      if (
        this.evalSegmentRules(rules, {
          a,
          score: s.score,
          segment: s.segment,
          tags: tagsByPerson.get(s.personId) ?? new Set(),
        })
      ) {
        matches.push(s.personId);
      }
    }
    return { count: matches.length, sample: matches.slice(0, 10) };
  }

  // ═══════════════════ TRIGGERS ═══════════════════

  listTriggers(actorType: string, actorId: string) {
    return this.prisma.crmTrigger.findMany({
      where: { actorType, actorId },
      orderBy: { key: "asc" },
    });
  }

  getTrigger(id: string) {
    return this.prisma.crmTrigger.findUnique({ where: { id } });
  }

  createTrigger(
    actorType: string,
    actorId: string,
    key: string,
    config?: Record<string, unknown>,
  ) {
    if (!(CRM_TRIGGER_KEYS as readonly string[]).includes(key)) {
      throw new CrmDomainError(
        "BAD_REQUEST",
        `key inválida: ${key} - debe ser una de ${CRM_TRIGGER_KEYS.join(", ")}`,
      );
    }
    const scope = TRIGGER_ACTOR_TYPES[key];
    if (scope && !scope.includes(actorType)) {
      throw new CrmDomainError(
        "BAD_REQUEST",
        `el trigger ${key} no aplica a actorType ${actorType}`,
      );
    }
    return this.prisma.crmTrigger.create({
      data: {
        actorType,
        actorId,
        key,
        config: (config ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  }

  updateTrigger(
    id: string,
    patch: { active?: boolean; config?: Record<string, unknown> },
  ) {
    return this.prisma.crmTrigger.update({
      where: { id },
      data: {
        ...(patch.active !== undefined ? { active: patch.active } : {}),
        ...(patch.config !== undefined
          ? { config: patch.config as Prisma.InputJsonValue }
          : {}),
      },
    });
  }

  /**
   * Evalúa los triggers activos del actor. Retorna un mapa
   * { triggerKey: { evaluated, notified } } solo con los triggers evaluados.
   */
  async evaluateTriggers(
    actorType: string,
    actorId: string,
  ): Promise<Record<string, TriggerEvalResult>> {
    const triggers = await this.prisma.crmTrigger.findMany({
      where: { actorType, actorId, active: true },
    });
    const out: Record<string, TriggerEvalResult> = {};
    for (const t of triggers) {
      out[t.key] = await this.evalTrigger(t);
    }
    return out;
  }

  /**
   * Evalúa todos los triggers activos de la plataforma (cron diario).
   * Un fallo en un actor no detiene el resto.
   */
  async evaluateAllActiveTriggers(): Promise<
    Record<string, Record<string, TriggerEvalResult>>
  > {
    const pairs = await this.prisma.crmTrigger.findMany({
      where: { active: true },
      select: { actorType: true, actorId: true },
      distinct: ["actorType", "actorId"],
    });
    const summary: Record<string, Record<string, TriggerEvalResult>> = {};
    for (const { actorType, actorId } of pairs) {
      const key = `${actorType}:${actorId}`;
      try {
        summary[key] = await this.evaluateTriggers(actorType, actorId);
      } catch (e) {
        this.logger.error(
          `evaluateTriggers falló para ${key}`,
          e instanceof Error ? e.stack : String(e),
        );
      }
    }
    return summary;
  }

  private evalTrigger(t: CrmTrigger): Promise<TriggerEvalResult> {
    switch (t.key as CrmTriggerKey) {
      case "WINBACK":
        return this.evalWinback(t);
      case "TRIAL_EXPIRING":
        return this.evalTrialExpiring(t);
      case "REGULAR_NO_PRESALE":
        return this.evalRegularNoPresale(t);
      case "ATTENDANCE_DROP":
        return this.evalAttendanceDrop(t);
      default:
        return Promise.resolve({ evaluated: 0, notified: 0 });
    }
  }

  private cfg(t: CrmTrigger): Record<string, unknown> {
    return (t.config ?? {}) as Record<string, unknown>;
  }

  private async winbackDays(t: CrmTrigger): Promise<number> {
    const c = this.cfg(t);
    const n = Number(c.days);
    if (Number.isFinite(n) && n > 0) return n;
    return this.params.getNumber("crm.winback_days", 21);
  }

  /**
   * Cooldown anti-spam para el cron diario: no re-notificar el mismo tipo
   * si ya existe una Notification reciente (config.cooldownDays, default 7).
   */
  private async notifyDeduped(
    personIds: string[],
    type: string,
    input: { title: string; body?: string; data?: Prisma.InputJsonValue },
    cooldownDays: number,
  ): Promise<number> {
    const cutoff = new Date(Date.now() - cooldownDays * DAY_MS);
    let notified = 0;
    for (const personId of personIds) {
      const recent = await this.prisma.notification.findFirst({
        where: { personId, type, createdAt: { gte: cutoff } },
        select: { id: true },
      });
      if (recent) continue;
      await this.notifications.notifySafe(personId, {
        category: "MARKETING",
        type,
        ...input,
      });
      notified++;
    }
    return notified;
  }

  /** WINBACK: personas del universo cuya última actividad > winback_days. */
  private async evalWinback(t: CrmTrigger): Promise<TriggerEvalResult> {
    const days = await this.winbackDays(t);
    const activity = await this.computeActivity(t.actorType, t.actorId);
    const cutoff = Date.now() - days * DAY_MS;
    const inactive = [...activity.entries()]
      .filter(([, a]) => a.lastAt && a.lastAt.getTime() < cutoff)
      .map(([personId]) => personId);
    const notified = await this.notifyDeduped(
      inactive,
      "crm.winback",
      {
        title: "Te extrañamos en la pista",
        body: "Hace un tiempo que no te vemos - vuelve a bailar.",
        data: {
          actorType: t.actorType,
          actorId: t.actorId,
          trigger: "WINBACK",
        },
      },
      this.cooldownDays(t),
    );
    return { evaluated: activity.size, notified };
  }

  /** TRIAL_EXPIRING (ACADEMY): enrollments TRIAL con ≥ config.days (def. 7) de antigüedad. */
  private async evalTrialExpiring(t: CrmTrigger): Promise<TriggerEvalResult> {
    if (t.actorType !== "ACADEMY") return { evaluated: 0, notified: 0 };
    const c = this.cfg(t);
    const minDays = Number.isFinite(Number(c.days)) ? Number(c.days) : 7;
    const trials = await this.prisma.enrollment.findMany({
      where: { academyId: t.actorId, status: "TRIAL" },
      select: { personId: true, startedAt: true },
    });
    const cutoff = Date.now() - minDays * DAY_MS;
    const expiring = trials
      .filter((e) => e.startedAt.getTime() <= cutoff)
      .map((e) => e.personId);
    const notified = await this.notifyDeduped(
      expiring,
      "crm.trial_expiring",
      {
        title: "Tu periodo de prueba está por terminar",
        body: "Regulariza tu membresía para seguir asistiendo a clases.",
        data: { actorType: t.actorType, actorId: t.actorId },
      },
      this.cooldownDays(t),
    );
    return { evaluated: trials.length, notified };
  }

  /**
   * REGULAR_NO_PRESALE (PRODUCER): personas CORE (≥3 asistencias) sin pago
   * PAID en los próximos eventos publicados del productor.
   */
  private async evalRegularNoPresale(
    t: CrmTrigger,
  ): Promise<TriggerEvalResult> {
    if (t.actorType !== "PRODUCER") return { evaluated: 0, notified: 0 };
    const upcoming = await this.prisma.event.findMany({
      where: {
        producerId: t.actorId,
        startsAt: { gt: new Date() },
        status: { in: ["PUBLISHED", "LIVE"] },
      },
      select: { id: true },
    });
    if (!upcoming.length) return { evaluated: 0, notified: 0 };

    const activity = await this.computeActivity(t.actorType, t.actorId);
    const regulars = [...activity.entries()]
      .filter(([, a]) => a.attendance >= CORE_ATTENDANCES)
      .map(([personId]) => personId);
    if (!regulars.length) return { evaluated: 0, notified: 0 };

    const buyers = await this.prisma.payment.findMany({
      where: {
        eventId: { in: upcoming.map((e) => e.id) },
        personId: { in: regulars },
        status: "PAID",
      },
      select: { personId: true },
    });
    const buyerSet = new Set(buyers.map((b) => b.personId));
    const targets = regulars.filter((p) => !buyerSet.has(p));

    const notified = await this.notifyDeduped(
      targets,
      "crm.regular_no_presale",
      {
        title: "Ya viene el próximo evento",
        body: "Asegura tu preventa antes de que se agoten.",
        data: { actorType: t.actorType, actorId: t.actorId },
      },
      this.cooldownDays(t),
    );
    return { evaluated: regulars.length, notified };
  }

  /**
   * ATTENDANCE_DROP: personas "recién caídas" - última actividad en la banda
   * (winback_days, 2*winback_days]. WINBACK cubre a las ya inactivas.
   */
  private async evalAttendanceDrop(
    t: CrmTrigger,
  ): Promise<TriggerEvalResult> {
    const days = await this.winbackDays(t);
    const activity = await this.computeActivity(t.actorType, t.actorId);
    const now = Date.now();
    const dropped = [...activity.entries()]
      .filter(([, a]) => {
        if (!a.lastAt) return false;
        const age = now - a.lastAt.getTime();
        return age > days * DAY_MS && age <= 2 * days * DAY_MS;
      })
      .map(([personId]) => personId);
    const notified = await this.notifyDeduped(
      dropped,
      "crm.attendance_drop",
      {
        title: "Te estás alejando de la pista",
        body: "Tus asistencias bajaron - retoma el ritmo.",
        data: { actorType: t.actorType, actorId: t.actorId },
      },
      this.cooldownDays(t),
    );
    return { evaluated: activity.size, notified };
  }

  private cooldownDays(t: CrmTrigger): number {
    const n = Number(this.cfg(t).cooldownDays);
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_NOTIFY_COOLDOWN_DAYS;
  }
}
