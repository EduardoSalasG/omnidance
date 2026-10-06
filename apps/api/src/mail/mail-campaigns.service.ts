import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  type OnApplicationBootstrap,
} from "@nestjs/common";
import { createHmac } from "node:crypto";
import type { MailCampaign, Prisma } from "@prisma/client";
import { MAILER, type Mailer } from "../auth/domain/ports";
import { JOB_REGISTRY, type JobRegistry } from "../jobs/registry";
import { nextRunAt } from "../jobs/jobs.service";
import { PrismaService } from "../prisma.service";

/** Especificación de audiencia - se RE-ANCLA en cada corrida (nunca snapshot). */
export type AudienceSpec =
  | { kind: "ALL" }
  | { kind: "ROLE"; roleKey: string }
  | { kind: "EVENT"; eventId: string }
  | { kind: "ENROLLMENTS_EXPIRING"; days: number }
  | { kind: "ENROLLMENTS_EXPIRED"; days: number }
  | { kind: "PLATFORM_SUB_EXPIRING"; days: number }
  | { kind: "CLAIMS_PENDING"; days: number };

/**
 * Destinatario resuelto: personId + variables de plantilla propias
 * (audiencias con contexto) + dedupKey del ciclo recordado - solo las
 * audiencias de ciclo de vida la traen; sin dedupKey no hay dedup
 * entre corridas (semántica newsletter).
 */
export interface ResolvedEntry {
  personId: string;
  ctx: Record<string, string>;
  dedupKey?: string;
}

const BASE_VARS = ["name", "email"];

/** Variables de plantilla que una audiencia aporta por destinatario. */
export function varsForAudience(spec: AudienceSpec): string[] {
  if (
    spec.kind === "ENROLLMENTS_EXPIRING" ||
    spec.kind === "ENROLLMENTS_EXPIRED"
  ) {
    return [...BASE_VARS, "academy", "plan", "endsAt"];
  }
  if (spec.kind === "PLATFORM_SUB_EXPIRING") {
    return [...BASE_VARS, "plan", "nextInvoiceAt"];
  }
  if (spec.kind === "CLAIMS_PENDING") {
    return [...BASE_VARS, "academy", "count"];
  }
  return BASE_VARS;
}

// Link de baja firmado (spec platform-polish-gaps): HMAC del personId
// con JWT_SECRET — sin sesión, sin token persistido, no falsificable.
export function unsubscribeToken(personId: string): string {
  return createHmac("sha256", process.env.JWT_SECRET ?? "")
    .update(personId)
    .digest("hex")
    .slice(0, 32);
}

function unsubscribeFooter(personId: string): string {
  const base = process.env.API_URL ?? "http://localhost:4000";
  const url = `${base}/api/mail/unsubscribe?p=${encodeURIComponent(personId)}&t=${unsubscribeToken(personId)}`;
  return (
    '<hr style="border:none;border-top:1px solid #e2e2e2;margin:24px 0 12px">' +
    `<p style="font:12px/1.5 sans-serif;color:#888">¿No quieres recibir estos correos? ` +
    `<a href="${url}" style="color:#888">Cancelar suscripción</a></p>`
  );
}

const VAR_RE = /\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/g;

function extractVars(text: string): Set<string> {
  const vars = new Set<string>();
  for (const m of text.matchAll(VAR_RE)) vars.add(m[1]);
  return vars;
}

function applyTemplate(text: string, vars: Record<string, string>): string {
  return text.replace(VAR_RE, (_m, key: string) => vars[key] ?? "");
}

const DAY_MS = 86_400_000;

// Destinatario elegible para campañas: con email y sin opt-out.
const ACTIVE_MAIL = {
  email: { not: null },
  mailOptOutAt: null,
} satisfies Prisma.PersonWhereInput;

const fmtCl = (d: Date) =>
  d.toLocaleDateString("es-CL", {
    timeZone: "America/Santiago",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

function validateAudience(spec: AudienceSpec): void {
  switch (spec.kind) {
    case "ALL":
      return;
    case "ROLE":
      if (!spec.roleKey) {
        throw new BadRequestException("audiencia ROLE requiere roleKey");
      }
      return;
    case "EVENT":
      if (!spec.eventId) {
        throw new BadRequestException("audiencia EVENT requiere eventId");
      }
      return;
    case "ENROLLMENTS_EXPIRING":
    case "ENROLLMENTS_EXPIRED":
    case "PLATFORM_SUB_EXPIRING":
    case "CLAIMS_PENDING":
      if (!Number.isInteger(spec.days) || spec.days < 1 || spec.days > 365) {
        throw new BadRequestException(
          `audiencia ${spec.kind} requiere days entero entre 1 y 365`,
        );
      }
      return;
    default:
      throw new BadRequestException("audiencia inválida");
  }
}

function validateTemplate(
  subject: string,
  html: string,
  spec: AudienceSpec,
): void {
  const allowed = new Set(varsForAudience(spec));
  const used = new Set([...extractVars(subject), ...extractVars(html)]);
  const bad = [...used].filter((v) => !allowed.has(v));
  if (bad.length > 0) {
    throw new BadRequestException(
      `variables no soportadas por la audiencia ${spec.kind}: ${bad.join(", ")} ` +
        `(disponibles: {{${[...allowed].join("}}, {{")}}})`,
    );
  }
}

export interface CampaignInput {
  name: string;
  subject: string;
  htmlBody: string;
  audience: AudienceSpec;
  scheduleKind: "ONCE" | "CRON";
  runAt?: Date | null;
  cronExpr?: string | null;
  timezone?: string;
  status?: "DRAFT" | "SCHEDULED";
}

const SEND_DELAY_MS = 150; // ≈6 req/s - dentro del rate de Resend
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Campañas de mail administrables (spec admin-jobs-mail-campaigns):
 * el admin compone subject+HTML, elige audiencia (ALL | ROLE | EVENT)
 * y programa una corrida única o recurrente. El dispatch lo hace el
 * ScheduledJob `mail.campaign_dispatch` (cada minuto, visible y
 * pausable en /admin/jobs). Cada corrida crea un MailCampaignRun con
 * recipients deduplicados - resumible y auditable por destinatario.
 */
@Injectable()
export class MailCampaignsService implements OnApplicationBootstrap {
  private readonly logger = new Logger(MailCampaignsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(MAILER) private readonly mailer: Mailer,
    @Inject(JOB_REGISTRY) private readonly registry: JobRegistry,
  ) {}

  onModuleInit(): void {
    this.registry.register({
      key: "mail.campaign_dispatch",
      label: "Despacho de campañas de mail",
      description:
        "Envía las campañas SCHEDULED cuya próxima corrida ya venció. Pausarlo detiene TODOS los envíos programados.",
      defaultCron: "* * * * *",
      handler: () => this.dispatchDue(),
    });
  }

  /** Crash recovery: corridas cortadas a mitad quedan cerradas. */
  async onApplicationBootstrap(): Promise<void> {
    if (process.env.NODE_ENV === "test") return;
    await this.recoverStaleRuns().catch((e: unknown) => {
      this.logger.error(
        "recovery de campañas falló",
        e instanceof Error ? e.stack : String(e),
      );
    });
  }

  private async recoverStaleRuns(): Promise<void> {
    const stale = await this.prisma.mailCampaignRun.findMany({
      where: { status: "RUNNING" },
      select: { id: true, campaignId: true },
    });
    for (const run of stale) {
      await this.prisma.mailCampaignRecipient.updateMany({
        where: { runId: run.id, status: "PENDING" },
        data: { status: "SKIPPED", error: "proceso reiniciado durante el envío" },
      });
      await this.prisma.mailCampaignRun.update({
        where: { id: run.id },
        data: {
          status: "ERROR",
          finishedAt: new Date(),
        },
      });
    }
    // Campañas que quedaron SENDING: CRON vuelve a SCHEDULED (re-agenda),
    // ONCE queda FAILED para revisión (pudo haber enviado parcialmente).
    const stuck = await this.prisma.mailCampaign.findMany({
      where: { status: "SENDING" },
    });
    for (const c of stuck) {
      await this.prisma.mailCampaign.update({
        where: { id: c.id },
        data:
          c.scheduleKind === "CRON"
            ? {
                status: "SCHEDULED",
                nextRunAt: nextRunAt(c.cronExpr ?? "* * * * *", c.timezone),
              }
            : { status: "FAILED" },
      });
    }
  }

  // ─── Audiencias ─────────────────────────────────────────────────

  /** Resuelve destinatarios CON email + ctx/dedupKey, en el momento actual. */
  async resolveAudience(spec: AudienceSpec): Promise<ResolvedEntry[]> {
    validateAudience(spec);
    if (spec.kind === "ALL") {
      const people = await this.prisma.person.findMany({
        where: ACTIVE_MAIL,
        select: { id: true },
      });
      return people.map((p) => ({ personId: p.id, ctx: {} }));
    }
    if (spec.kind === "ROLE") {
      const roles = await this.prisma.personRole.findMany({
        where: { role: spec.roleKey, status: "APPROVED", person: ACTIVE_MAIL },
        select: { personId: true },
      });
      return roles.map((r) => ({ personId: r.personId, ctx: {} }));
    }
    if (spec.kind === "EVENT") {
      // Ticket.ownerId es string plano (sin relación) - dos pasos.
      const tickets = await this.prisma.ticket.findMany({
        where: { eventId: spec.eventId, status: "ACTIVE" },
        select: { ownerId: true },
      });
      const ownerIds = [...new Set(tickets.map((t) => t.ownerId))];
      const people = await this.prisma.person.findMany({
        where: { id: { in: ownerIds }, ...ACTIVE_MAIL },
        select: { id: true },
      });
      return people.map((p) => ({ personId: p.id, ctx: {} }));
    }
    const now = new Date();
    if (spec.kind === "ENROLLMENTS_EXPIRING") {
      return this.enrollmentsInWindow(now, new Date(now.getTime() + spec.days * DAY_MS));
    }
    if (spec.kind === "ENROLLMENTS_EXPIRED") {
      return this.enrollmentsInWindow(new Date(now.getTime() - spec.days * DAY_MS), now);
    }
    if (spec.kind === "CLAIMS_PENDING") {
      return this.claimsPending(spec.days);
    }
    return this.platformSubsExpiring(now, new Date(now.getTime() + spec.days * DAY_MS));
  }

  /**
   * Owners de academias con claims PENDING más viejos que `days` días
   * (spec platform-polish-gaps) - recordatorio "tienes comprobantes
   * sin validar". dedupKey por academia+día CL: máximo un aviso al día
   * mientras sigan existiendo pendientes.
   */
  private async claimsPending(days: number): Promise<ResolvedEntry[]> {
    const cutoff = new Date(Date.now() - days * DAY_MS);
    const byAcademy = await this.prisma.paymentClaim.groupBy({
      by: ["academyId"],
      where: { status: "PENDING", createdAt: { lt: cutoff } },
      _count: { _all: true },
    });
    if (byAcademy.length === 0) return [];
    const academies = await this.prisma.academy.findMany({
      where: { id: { in: byAcademy.map((c) => c.academyId) } },
      select: { id: true, name: true, ownerId: true },
    });
    const withEmail = new Set(
      (
        await this.prisma.person.findMany({
          where: { id: { in: academies.map((a) => a.ownerId) }, ...ACTIVE_MAIL },
          select: { id: true },
        })
      ).map((p) => p.id),
    );
    const countOf = new Map(byAcademy.map((c) => [c.academyId, c._count._all]));
    const todayCl = new Date().toLocaleDateString("en-CA", {
      timeZone: "America/Santiago",
    });
    return academies
      .filter((a) => withEmail.has(a.ownerId))
      .map((a) => ({
        personId: a.ownerId,
        dedupKey: `claims:${a.id}:${todayCl}`,
        ctx: {
          academy: a.name,
          count: String(countOf.get(a.id) ?? 0),
        },
      }));
  }

  /**
   * Inscripciones pagadas con endsAt en la ventana (por vencer o en
   * gracia). `Enrollment.personId` es string plano - el email se
   * resuelve en segunda query. dedupKey por ciclo: una renovación
   * cambia endsAt y rearma el recordatorio.
   */
  private async enrollmentsInWindow(lo: Date, hi: Date): Promise<ResolvedEntry[]> {
    const rows = await this.prisma.enrollment.findMany({
      where: { status: { in: ["ACTIVE", "ONLINE"] }, endsAt: { gte: lo, lt: hi } },
      select: {
        id: true,
        personId: true,
        endsAt: true,
        academy: { select: { name: true } },
        plan: { select: { name: true } },
      },
    });
    const withEmail = new Set(
      (
        await this.prisma.person.findMany({
          where: { id: { in: rows.map((r) => r.personId) }, ...ACTIVE_MAIL },
          select: { id: true },
        })
      ).map((p) => p.id),
    );
    return rows
      .filter((r) => r.endsAt && withEmail.has(r.personId))
      .map((r) => ({
        personId: r.personId,
        dedupKey: `enr:${r.id}:${r.endsAt!.toISOString()}`,
        ctx: {
          academy: r.academy.name,
          plan: r.plan?.name ?? "tu plan",
          endsAt: fmtCl(r.endsAt!),
        },
      }));
  }

  /** Suscripciones de plataforma (SaaS academia / Producer Pro) por cobrar. */
  private async platformSubsExpiring(lo: Date, hi: Date): Promise<ResolvedEntry[]> {
    const rows = await this.prisma.platformSubscription.findMany({
      where: { status: "ACTIVE", nextInvoiceAt: { gte: lo, lt: hi } },
      select: { id: true, personId: true, nextInvoiceAt: true, tierCode: true },
    });
    const withEmail = new Set(
      (
        await this.prisma.person.findMany({
          where: { id: { in: rows.map((r) => r.personId) }, ...ACTIVE_MAIL },
          select: { id: true },
        })
      ).map((p) => p.id),
    );
    return rows
      .filter((r) => r.nextInvoiceAt && withEmail.has(r.personId))
      .map((r) => ({
        personId: r.personId,
        dedupKey: `psub:${r.id}:${r.nextInvoiceAt!.toISOString()}`,
        ctx: {
          plan: r.tierCode,
          nextInvoiceAt: fmtCl(r.nextInvoiceAt!),
        },
      }));
  }

  async audienceCount(spec: AudienceSpec): Promise<{ count: number }> {
    return { count: (await this.resolveAudience(spec)).length };
  }

  // ─── CRUD ───────────────────────────────────────────────────────

  list() {
    return this.prisma.mailCampaign.findMany({
      orderBy: { createdAt: "desc" },
      include: { runs: { orderBy: { startedAt: "desc" }, take: 1 } },
    });
  }

  async get(id: string) {
    const campaign = await this.prisma.mailCampaign.findUnique({
      where: { id },
      include: { runs: { orderBy: { startedAt: "desc" }, take: 20 } },
    });
    if (!campaign) throw new NotFoundException("campaña no existe");
    return campaign;
  }

  listRuns(id: string) {
    return this.prisma.mailCampaignRun.findMany({
      where: { campaignId: id },
      orderBy: { startedAt: "desc" },
      take: 50,
      include: { _count: { select: { recipients: true } } },
    });
  }

  async create(actorId: string, input: CampaignInput) {
    validateAudience(input.audience);
    validateTemplate(input.subject, input.htmlBody, input.audience);
    const schedule = this.validateSchedule(input);
    const campaign = await this.prisma.mailCampaign.create({
      data: {
        name: input.name,
        subject: input.subject,
        htmlBody: input.htmlBody,
        audience: input.audience as unknown as Prisma.InputJsonValue,
        scheduleKind: input.scheduleKind,
        runAt: input.scheduleKind === "ONCE" ? input.runAt : null,
        cronExpr: input.scheduleKind === "CRON" ? input.cronExpr : null,
        timezone: input.timezone ?? "America/Santiago",
        status: input.status ?? "DRAFT",
        nextRunAt: input.status === "SCHEDULED" ? schedule : null,
        createdById: actorId,
      },
    });
    await this.audit(actorId, "MAIL_CAMPAIGN_CREATE", campaign.id, {
      name: input.name,
      scheduleKind: input.scheduleKind,
      status: campaign.status,
    });
    return campaign;
  }

  async update(id: string, actorId: string, input: Partial<CampaignInput>) {
    const campaign = await this.get(id);
    if (campaign.status === "SENDING") {
      throw new ConflictException("campaña en envío - primero cancélala");
    }
    if (campaign.status === "DONE" || campaign.status === "FAILED" || campaign.status === "CANCELLED") {
      throw new ConflictException(`campaña ${campaign.status} es inmutable`);
    }
    const merged: CampaignInput = {
      name: input.name ?? campaign.name,
      subject: input.subject ?? campaign.subject,
      htmlBody: input.htmlBody ?? campaign.htmlBody,
      audience: (input.audience ?? (campaign.audience as unknown as AudienceSpec)),
      scheduleKind: input.scheduleKind ?? (campaign.scheduleKind as "ONCE" | "CRON"),
      runAt: input.runAt !== undefined ? input.runAt : campaign.runAt,
      cronExpr: input.cronExpr !== undefined ? input.cronExpr : campaign.cronExpr,
      timezone: input.timezone ?? campaign.timezone,
      status: input.status ?? (campaign.status as "DRAFT" | "SCHEDULED"),
    };
    validateAudience(merged.audience);
    validateTemplate(merged.subject, merged.htmlBody, merged.audience);
    const next = merged.status === "SCHEDULED" ? this.validateSchedule(merged) : null;
    const updated = await this.prisma.mailCampaign.update({
      where: { id },
      data: {
        name: merged.name,
        subject: merged.subject,
        htmlBody: merged.htmlBody,
        audience: merged.audience as unknown as Prisma.InputJsonValue,
        scheduleKind: merged.scheduleKind,
        runAt: merged.scheduleKind === "ONCE" ? merged.runAt : null,
        cronExpr: merged.scheduleKind === "CRON" ? merged.cronExpr : null,
        timezone: merged.timezone,
        status: merged.status,
        nextRunAt: next,
      },
    });
    await this.audit(actorId, "MAIL_CAMPAIGN_UPDATE", id, {
      prev: { status: campaign.status },
      next: { status: updated.status },
    });
    return updated;
  }

  private validateSchedule(input: CampaignInput): Date {
    if (input.scheduleKind === "ONCE") {
      if (!input.runAt) {
        throw new BadRequestException("una campaña única requiere runAt (fecha-hora)");
      }
      return input.runAt;
    }
    if (!input.cronExpr) {
      throw new BadRequestException("una campaña recurrente requiere cronExpr");
    }
    const next = nextRunAt(input.cronExpr, input.timezone ?? "America/Santiago");
    if (!next) {
      throw new BadRequestException(`expresión cron inválida: ${input.cronExpr}`);
    }
    return next;
  }

  async cancel(id: string, actorId: string) {
    const campaign = await this.get(id);
    if (!["DRAFT", "SCHEDULED", "SENDING"].includes(campaign.status)) {
      throw new ConflictException(`campaña ${campaign.status} no se puede cancelar`);
    }
    const updated = await this.prisma.mailCampaign.update({
      where: { id },
      data: { status: "CANCELLED", nextRunAt: null },
    });
    await this.audit(actorId, "MAIL_CAMPAIGN_CANCEL", id, {
      prevStatus: campaign.status,
    });
    return updated;
  }

  /** Copia de prueba al email del admin - sin run ni recipients. Las
   *  variables se sustituyen con el ctx del primer destinatario real
   *  resuelto (o quedan vacías si la audiencia está vacía). */
  async testSend(id: string, actorId: string) {
    const campaign = await this.get(id);
    const actor = await this.prisma.person.findUnique({
      where: { id: actorId },
      select: { email: true, name: true },
    });
    if (!actor?.email) {
      throw new BadRequestException("tu cuenta no tiene email para la prueba");
    }
    const spec = campaign.audience as unknown as AudienceSpec;
    const entries = await this.resolveAudience(spec);
    const vars = {
      name: actor.name ?? "Admin",
      email: actor.email,
      ...(entries[0]?.ctx ?? {}),
    };
    const subject = `[TEST] ${applyTemplate(campaign.subject, vars)}`;
    await this.mailer.send(
      actor.email,
      subject,
      applyTemplate(campaign.htmlBody, vars) + unsubscribeFooter(actorId),
    );
    await this.audit(actorId, "MAIL_CAMPAIGN_TEST", id, { to: actor.email });
    return { sent: actor.email };
  }

  // ─── Envío ──────────────────────────────────────────────────────

  /** Job handler: despacha campañas SCHEDULED con nextRunAt vencido. */
  async dispatchDue(now = new Date()): Promise<Record<string, unknown>> {
    const due = await this.prisma.mailCampaign.findMany({
      where: { status: "SCHEDULED", nextRunAt: { lte: now } },
    });
    let dispatched = 0;
    let sent = 0;
    let failed = 0;
    for (const campaign of due) {
      const res = await this.sendRun(campaign, "CRON");
      dispatched++;
      sent += res.sent;
      failed += res.failed;
    }
    return { dispatched, sent, failed };
  }

  /** Corrida manual: cualquier estado que no sea SENDING/CANCELLED. */
  async runNow(id: string, actorId: string) {
    const campaign = await this.get(id);
    if (campaign.status === "SENDING") {
      throw new ConflictException("la campaña ya está en envío");
    }
    if (campaign.status === "CANCELLED") {
      throw new ConflictException("la campaña está cancelada");
    }
    const res = await this.sendRun(campaign, "MANUAL");
    await this.audit(actorId, "MAIL_CAMPAIGN_RUN", id, res);
    return res;
  }

  /**
   * Ejecuta una corrida: marca SENDING (prevStatus para restaurar en
   * manuales sobre DRAFT), re-ancla audiencia, crea recipients dedup y
   * envía secuencial con chequeo de cancelación entre destinatarios.
   */
  private async sendRun(
    campaign: MailCampaign,
    trigger: "CRON" | "MANUAL",
  ): Promise<{ runId: string; sent: number; failed: number; cancelled?: boolean }> {
    const prevStatus = campaign.status;
    await this.prisma.mailCampaign.update({
      where: { id: campaign.id },
      data: { status: "SENDING" },
    });
    const run = await this.prisma.mailCampaignRun.create({
      data: { campaignId: campaign.id, trigger, status: "RUNNING", startedAt: new Date() },
    });
    const entries = await this.resolveAudience(
      campaign.audience as unknown as AudienceSpec,
    );
    // Un recipient por contexto: dedupKey distingue ciclos de la misma
    // persona ("" en audiencias genéricas = 1 por persona por run).
    const slotOf = (personId: string, dedupKey?: string) =>
      `${personId} ${dedupKey ?? ""}`;
    await this.prisma.mailCampaignRecipient.createMany({
      data: entries.map((e) => ({
        runId: run.id,
        personId: e.personId,
        dedupKey: e.dedupKey ?? "",
      })),
      skipDuplicates: true,
    });
    const bySlot = new Map<string, ResolvedEntry>();
    for (const e of entries) {
      bySlot.set(slotOf(e.personId, e.dedupKey), e);
    }
    // Ciclos ya recordados en corridas anteriores de esta campaña.
    const sentKeys = new Set(
      (
        await this.prisma.mailCampaignSent.findMany({
          where: { campaignId: campaign.id },
          select: { dedupKey: true },
        })
      ).map((s) => s.dedupKey),
    );
    const pending = await this.prisma.mailCampaignRecipient.findMany({
      where: { runId: run.id, status: "PENDING" },
    });
    let sent = 0;
    let failed = 0;
    let cancelled = false;
    for (const recipient of pending) {
      const fresh = await this.prisma.mailCampaign.findUnique({
        where: { id: campaign.id },
        select: { status: true },
      });
      if (fresh?.status === "CANCELLED") {
        cancelled = true;
        break;
      }
      const entry = bySlot.get(slotOf(recipient.personId, recipient.dedupKey));
      if (entry?.dedupKey && sentKeys.has(entry.dedupKey)) {
        await this.prisma.mailCampaignRecipient.update({
          where: { id: recipient.id },
          data: { status: "SKIPPED", error: "ciclo ya recordado" },
        });
        continue;
      }
      const person = await this.prisma.person.findUnique({
        where: { id: recipient.personId },
        select: { email: true, name: true, mailOptOutAt: true },
      });
      if (!person?.email) {
        await this.prisma.mailCampaignRecipient.update({
          where: { id: recipient.id },
          data: { status: "SKIPPED", error: "sin email" },
        });
        continue;
      }
      // Opt-out entre resolución y envío: se respeta igual.
      if (person.mailOptOutAt) {
        await this.prisma.mailCampaignRecipient.update({
          where: { id: recipient.id },
          data: { status: "SKIPPED", error: "baja de suscripción" },
        });
        continue;
      }
      const vars = {
        name: person.name ?? "",
        email: person.email,
        ...(entry?.ctx ?? {}),
      };
      try {
        await this.mailer.send(
          person.email,
          applyTemplate(campaign.subject, vars),
          applyTemplate(campaign.htmlBody, vars) +
            unsubscribeFooter(recipient.personId),
        );
        await this.prisma.mailCampaignRecipient.update({
          where: { id: recipient.id },
          data: { status: "SENT", sentAt: new Date() },
        });
        if (entry?.dedupKey) {
          // Marca el ciclo como recordado; un choque de unique (mismo
          // dedupKey en otro run) es benigno - significa ya enviado.
          await this.prisma.mailCampaignSent
            .create({
              data: {
                campaignId: campaign.id,
                dedupKey: entry.dedupKey,
                personId: recipient.personId,
                runId: run.id,
              },
            })
            .catch(() => {});
          sentKeys.add(entry.dedupKey);
        }
        sent++;
      } catch (e) {
        await this.prisma.mailCampaignRecipient.update({
          where: { id: recipient.id },
          data: {
            status: "FAILED",
            error: e instanceof Error ? e.message : String(e),
          },
        });
        failed++;
      }
      await sleep(SEND_DELAY_MS);
    }
    if (cancelled) {
      await this.prisma.mailCampaignRecipient.updateMany({
        where: { runId: run.id, status: "PENDING" },
        data: { status: "SKIPPED", error: "campaña cancelada" },
      });
    }
    await this.prisma.mailCampaignRun.update({
      where: { id: run.id },
      data: {
        status: cancelled ? "CANCELLED" : "OK",
        sentCount: sent,
        failCount: failed,
        finishedAt: new Date(),
      },
    });
    // Estado final de la campaña: cancelada > ONCE done > vuelve al
    // estado previo (SCHEDULED con nextRunAt recalculado, o DRAFT/DONE
    // tras una corrida manual).
    const current = await this.prisma.mailCampaign.findUnique({
      where: { id: campaign.id },
      select: { status: true },
    });
    if (current?.status !== "CANCELLED") {
      const terminal =
        campaign.scheduleKind === "ONCE" && !cancelled ? "DONE" : prevStatus;
      await this.prisma.mailCampaign.update({
        where: { id: campaign.id },
        data: {
          status: cancelled ? "CANCELLED" : terminal,
          lastRunAt: new Date(),
          sentCount: { increment: sent },
          failCount: { increment: failed },
          nextRunAt:
            !cancelled && campaign.scheduleKind === "CRON"
              ? nextRunAt(campaign.cronExpr ?? "* * * * *", campaign.timezone)
              : cancelled
                ? null
                : campaign.nextRunAt,
        },
      });
    }
    return { runId: run.id, sent, failed, cancelled };
  }

  private async audit(
    actorId: string,
    action: string,
    targetId: string,
    payload: Prisma.InputJsonValue,
  ) {
    await this.prisma.auditLog.create({
      data: {
        actorId,
        action,
        targetType: "MailCampaign",
        targetId,
        payload,
      },
    });
  }
}
