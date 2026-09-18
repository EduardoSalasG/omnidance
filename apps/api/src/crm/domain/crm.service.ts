import { Injectable, Logger } from "@nestjs/common";
import { randomBytes } from "crypto";
import type { Campaign, CrmTrigger, Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma.service";
import { NotificationsService } from "../../notifications/domain/notifications.service";
import { ParamsService } from "../../params/params.service";

// CRM transversal (omni-dance.md — CRM por actor): scores de relación,
// tags, campañas y triggers automáticos para PRODUCER / ACADEMY.
// Servicio de orquestación con PrismaService inyectado (estilo ParamsService);
// la autorización por actor vive en el controller (assertActorAccess).

export const CRM_TRIGGER_KEYS = [
  "WINBACK",
  "TRIAL_EXPIRING",
  "REGULAR_NO_PRESALE",
  "ATTENDANCE_DROP",
] as const;
export type CrmTriggerKey = (typeof CRM_TRIGGER_KEYS)[number];

export type CrmErrorCode = "NOT_FOUND" | "BAD_REQUEST" | "CONFLICT";

export class CrmDomainError extends Error {
  constructor(
    readonly code: CrmErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "CrmDomainError";
  }
}

/** Segmento de campaña — los criterios presentes se unen (OR lógico). */
export interface CampaignSegment {
  tags?: string[];
  segment?: string;
  personIds?: string[];
}

export type CampaignAction =
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
}

const DAY_MS = 86_400_000;
const NEW_DAYS = 30;
const CORE_ATTENDANCES = 3;
const BRINGS_PEOPLE_REFERRALS = 2;
const DEFAULT_NOTIFY_COOLDOWN_DAYS = 7;

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
   * join person{id,name,photoUrl}, ordenado por score desc (tag-only al final).
   */
  async listPeople(actorType: string, actorId: string) {
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

    const personIds = [
      ...new Set([
        ...scores.map((s) => s.personId),
        ...tags.map((t) => t.personId),
      ]),
    ];
    const people = await this.prisma.person.findMany({
      where: { id: { in: personIds } },
      select: { id: true, name: true, photoUrl: true },
    });
    const personById = new Map(people.map((p) => [p.id, p]));

    const tagsByPerson = new Map<string, typeof tags>();
    for (const t of tags) {
      const list = tagsByPerson.get(t.personId) ?? [];
      list.push(t);
      tagsByPerson.set(t.personId, list);
    }

    const rows: CrmPersonRow[] = scores.map((s) => ({
      personId: s.personId,
      score: s.score,
      segment: s.segment,
      computedAt: s.computedAt,
      person: personById.get(s.personId) ?? null,
      tags: tagsByPerson.get(s.personId) ?? [],
    }));
    const withScore = new Set(scores.map((s) => s.personId));
    for (const t of tags) {
      if (withScore.has(t.personId)) continue;
      withScore.add(t.personId);
      rows.push({
        personId: t.personId,
        score: null,
        segment: null,
        computedAt: null,
        person: personById.get(t.personId) ?? null,
        tags: tagsByPerson.get(t.personId) ?? [],
      });
    }
    return rows;
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

  // ═══════════════════ SCORES ═══════════════════

  /**
   * Recalcula RelationshipScore por persona para el actor.
   *
   * Universo:
   * - PRODUCER → checkins no anulados + pagos PAID en eventos del productor.
   * - ACADEMY  → enrollments de la academia (asistencia vía Attendance en
   *   clases de sus slots; sin vínculo Payment↔academy en schema v1 → spend=0).
   *
   * score = min(100, attendance*10 + spend/1000 + referrals*15)
   *
   * segment (primer match):
   * - NEW           primera actividad < 30d
   * - AT_RISK       última actividad > crm.winback_days (fallback 21)
   * - BRINGS_PEOPLE ≥ 2 referrals
   * - CORE          ≥ 3 asistencias
   * - null          resto
   */
  async recomputeScores(
    actorType: string,
    actorId: string,
  ): Promise<{ updated: number }> {
    const winbackDays = await this.params.getNumber("crm.winback_days", 21);
    const activity = await this.computeActivity(actorType, actorId);
    const now = new Date();

    let updated = 0;
    for (const [personId, a] of activity) {
      const score = Math.min(
        100,
        a.attendance * 10 + a.spend / 1000 + a.referrals * 15,
      );
      const segment = this.computeSegment(a, winbackDays, now);
      await this.prisma.relationshipScore.upsert({
        where: {
          actorType_actorId_personId: { actorType, actorId, personId },
        },
        update: { score, segment, computedAt: now },
        create: { actorType, actorId, personId, score, segment },
      });
      updated++;
    }
    return { updated };
  }

  private computeSegment(
    a: PersonActivity,
    winbackDays: number,
    now: Date,
  ): string | null {
    if (a.firstAt && now.getTime() - a.firstAt.getTime() < NEW_DAYS * DAY_MS) {
      return "NEW";
    }
    if (
      a.lastAt &&
      now.getTime() - a.lastAt.getTime() > winbackDays * DAY_MS
    ) {
      return "AT_RISK";
    }
    if (a.referrals >= BRINGS_PEOPLE_REFERRALS) return "BRINGS_PEOPLE";
    if (a.attendance >= CORE_ATTENDANCES) return "CORE";
    return null;
  }

  /**
   * Actividad por persona dentro del universo del actor.
   * PRODUCER: checkins (voidedAt=null) + payments PAID en sus eventos.
   * ACADEMY: enrollments + attendances en clases de sus ClassSlot.
   */
  private async computeActivity(
    actorType: string,
    actorId: string,
  ): Promise<Map<string, PersonActivity>> {
    const activity = new Map<string, PersonActivity>();
    const touch = (personId: string, at: Date | null) => {
      const a: PersonActivity = activity.get(personId) ?? {
        attendance: 0,
        spend: 0,
        referrals: 0,
        firstAt: null,
        lastAt: null,
      };
      if (at) {
        if (!a.firstAt || at < a.firstAt) a.firstAt = at;
        if (!a.lastAt || at > a.lastAt) a.lastAt = at;
      }
      activity.set(personId, a);
      return a;
    };

    if (actorType === "PRODUCER") {
      const events = await this.prisma.event.findMany({
        where: { producerId: actorId },
        select: { id: true },
      });
      const eventIds = events.map((e) => e.id);
      if (!eventIds.length) return activity;

      const [checkins, payments] = await Promise.all([
        this.prisma.checkin.findMany({
          where: { eventId: { in: eventIds }, voidedAt: null },
          select: { personId: true, inAt: true },
        }),
        this.prisma.payment.findMany({
          where: { eventId: { in: eventIds }, status: "PAID" },
          select: { personId: true, amount: true, createdAt: true },
        }),
      ]);

      for (const c of checkins) {
        const a = touch(c.personId, c.inAt);
        a.attendance++;
      }
      for (const p of payments) {
        const a = touch(p.personId, p.createdAt);
        a.spend += p.amount;
      }
    } else if (actorType === "ACADEMY") {
      const enrollments = await this.prisma.enrollment.findMany({
        where: { academyId: actorId },
        select: { personId: true, startedAt: true, createdAt: true },
      });
      const personIds = [...new Set(enrollments.map((e) => e.personId))];
      const attendances = personIds.length
        ? await this.prisma.attendance.findMany({
            where: {
              personId: { in: personIds },
              class: { slot: { academyId: actorId } },
            },
            select: { personId: true, checkedAt: true },
          })
        : [];

      for (const e of enrollments) touch(e.personId, e.startedAt ?? e.createdAt);
      for (const at of attendances) {
        const a = touch(at.personId, at.checkedAt);
        a.attendance++;
      }
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

  // ═══════════════════ CAMPAIGNS ═══════════════════

  createCampaign(
    actorType: string,
    actorId: string,
    name: string,
    segment: unknown,
    action: unknown,
  ) {
    const parsedSegment = this.parseSegment(segment);
    const parsedAction = this.parseAction(action);
    return this.prisma.campaign.create({
      data: {
        actorType,
        actorId,
        name,
        segment: parsedSegment as Prisma.InputJsonValue,
        action: parsedAction as Prisma.InputJsonValue,
        status: "DRAFT",
      },
    });
  }

  getCampaign(id: string) {
    return this.prisma.campaign.findUnique({ where: { id } });
  }

  listCampaigns(actorType: string, actorId: string) {
    return this.prisma.campaign.findMany({
      where: { actorType, actorId },
      orderBy: { createdAt: "desc" },
    });
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
    if (campaign.status !== "DRAFT") {
      throw new CrmDomainError("CONFLICT", "la campaña ya fue enviada");
    }

    const segment = this.parseSegment(campaign.segment);
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
        result: {
          sent: personIds.length,
          ...(code ? { code } : {}),
          at: new Date().toISOString(),
        },
      },
    });
  }

  /** Resuelve el segmento a personIds — unión de los criterios presentes. */
  private async resolveSegment(
    actorType: string,
    actorId: string,
    segment: CampaignSegment,
  ): Promise<string[]> {
    const ids = new Set<string>(segment.personIds ?? []);

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

    return [...ids];
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

  private parseSegment(raw: unknown): CampaignSegment {
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
    return {
      tags: s.tags,
      segment: s.segment,
      personIds: s.personIds,
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
        `key inválida: ${key} — debe ser una de ${CRM_TRIGGER_KEYS.join(", ")}`,
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
        body: "Hace un tiempo que no te vemos — vuelve a bailar.",
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
   * ATTENDANCE_DROP: personas "recién caídas" — última actividad en la banda
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
        body: "Tus asistencias bajaron — retoma el ritmo.",
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
