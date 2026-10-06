import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  type OnApplicationBootstrap,
} from "@nestjs/common";
import type { MailCampaign, Prisma } from "@prisma/client";
import { MAILER, type Mailer } from "../auth/domain/ports";
import { JOB_REGISTRY, type JobRegistry } from "../jobs/registry";
import { nextRunAt } from "../jobs/jobs.service";
import { PrismaService } from "../prisma.service";

/** Especificación de audiencia - se RE-ANCLA en cada corrida (nunca snapshot). */
export type AudienceSpec =
  | { kind: "ALL" }
  | { kind: "ROLE"; roleKey: string }
  | { kind: "EVENT"; eventId: string };

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

  /** Resuelve los personIds CON email de una audiencia, en el momento actual. */
  async resolveAudience(spec: AudienceSpec): Promise<string[]> {
    if (spec.kind === "ALL") {
      const people = await this.prisma.person.findMany({
        where: { email: { not: null } },
        select: { id: true },
      });
      return people.map((p) => p.id);
    }
    if (spec.kind === "ROLE") {
      const roles = await this.prisma.personRole.findMany({
        where: { role: spec.roleKey, status: "APPROVED", person: { email: { not: null } } },
        select: { personId: true },
      });
      return roles.map((r) => r.personId);
    }
    if (spec.kind === "EVENT") {
      // Ticket.ownerId es string plano (sin relación) - dos pasos.
      const tickets = await this.prisma.ticket.findMany({
        where: { eventId: spec.eventId, status: "ACTIVE" },
        select: { ownerId: true },
      });
      const ownerIds = [...new Set(tickets.map((t) => t.ownerId))];
      const people = await this.prisma.person.findMany({
        where: { id: { in: ownerIds }, email: { not: null } },
        select: { id: true },
      });
      return people.map((p) => p.id);
    }
    throw new BadRequestException("audiencia inválida");
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

  /** Copia de prueba al email del admin - sin run ni recipients. */
  async testSend(id: string, actorId: string) {
    const campaign = await this.get(id);
    const actor = await this.prisma.person.findUnique({
      where: { id: actorId },
      select: { email: true },
    });
    if (!actor?.email) {
      throw new BadRequestException("tu cuenta no tiene email para la prueba");
    }
    await this.mailer.send(actor.email, `[TEST] ${campaign.subject}`, campaign.htmlBody);
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
    const personIds = await this.resolveAudience(
      campaign.audience as unknown as AudienceSpec,
    );
    await this.prisma.mailCampaignRecipient.createMany({
      data: personIds.map((personId) => ({ runId: run.id, personId })),
      skipDuplicates: true,
    });
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
      const person = await this.prisma.person.findUnique({
        where: { id: recipient.personId },
        select: { email: true },
      });
      if (!person?.email) {
        await this.prisma.mailCampaignRecipient.update({
          where: { id: recipient.id },
          data: { status: "SKIPPED", error: "sin email" },
        });
        continue;
      }
      try {
        await this.mailer.send(person.email, campaign.subject, campaign.htmlBody);
        await this.prisma.mailCampaignRecipient.update({
          where: { id: recipient.id },
          data: { status: "SENT", sentAt: new Date() },
        });
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
