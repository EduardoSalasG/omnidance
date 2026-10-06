import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  type OnApplicationBootstrap,
} from "@nestjs/common";
import { CronExpressionParser } from "cron-parser";
import type { Prisma, ScheduledJob } from "@prisma/client";
import { PrismaService } from "../prisma.service";
import { JOB_REGISTRY, type JobRegistry } from "./registry";

const DEFAULT_TZ = "America/Santiago";

/**
 * Próxima corrida de una expresión cron en su timezone (cron-parser
 * maneja DST de America/Santiago). null = expresión inválida.
 */
export function nextRunAt(
  cronExpr: string,
  timezone: string,
  from: Date = new Date(),
): Date | null {
  try {
    return CronExpressionParser.parse(cronExpr, {
      currentDate: from,
      tz: timezone,
    })
      .next()
      .toDate();
  } catch {
    return null;
  }
}

/**
 * Consola de jobs (spec admin-jobs-mail-campaigns): la DB es la fuente
 * de verdad del horario. sync() en bootstrap hace upsert por key sin
 * pisar cronExpr/enabled/timezone editados por el admin, y marca
 * orphaned los handlers que desaparecieron del código. tick() corre
 * cada minuto desde JobsRunner: ejecuta jobs enabled con nextRunAt
 * vencido (catch-up automático tras downtime) y persiste JobRun.
 */
@Injectable()
export class JobsService implements OnApplicationBootstrap {
  private readonly logger = new Logger(JobsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(JOB_REGISTRY) private readonly registry: JobRegistry,
  ) {}

  /** Corre después de todos los onModuleInit (registro ya poblado). */
  async onApplicationBootstrap(): Promise<void> {
    if (process.env.NODE_ENV === "test") return;
    await this.sync().catch((e: unknown) => {
      this.logger.error(
        "sync de jobs falló",
        e instanceof Error ? e.stack : String(e),
      );
    });
  }

  async sync(): Promise<void> {
    const registered = this.registry.all();
    const keys = new Set(registered.map((r) => r.key));
    for (const reg of registered) {
      const tz = reg.timezone ?? DEFAULT_TZ;
      const existing = await this.prisma.scheduledJob.findUnique({
        where: { key: reg.key },
      });
      if (!existing) {
        await this.prisma.scheduledJob.create({
          data: {
            key: reg.key,
            label: reg.label,
            description: reg.description,
            cronExpr: reg.defaultCron,
            defaultCron: reg.defaultCron,
            timezone: tz,
            nextRunAt: nextRunAt(reg.defaultCron, tz),
          },
        });
      } else {
        await this.prisma.scheduledJob.update({
          where: { key: reg.key },
          data: {
            label: reg.label,
            description: reg.description,
            defaultCron: reg.defaultCron,
            orphaned: false,
          },
        });
      }
    }
    await this.prisma.scheduledJob.updateMany({
      where: { key: { notIn: [...keys] }, orphaned: false },
      data: { orphaned: true },
    });
    // Corridas que quedaron RUNNING por un crash/restart: se cierran
    // como ERROR y se libera el mutex para que el job vuelva a correr.
    await this.prisma.jobRun.updateMany({
      where: { status: "RUNNING" },
      data: {
        status: "ERROR",
        error: "proceso reiniciado durante la corrida",
        finishedAt: new Date(),
      },
    });
    await this.prisma.scheduledJob.updateMany({
      where: { runningRunId: { not: null } },
      data: { runningRunId: null, lastStatus: "ERROR" },
    });
  }

  list() {
    return this.prisma.scheduledJob.findMany({ orderBy: { key: "asc" } });
  }

  listRuns(key: string, take = 50) {
    return this.prisma.jobRun.findMany({
      where: { job: { key } },
      orderBy: { startedAt: "desc" },
      take,
    });
  }

  /**
   * Edición del admin: valida el cron, recalcula nextRunAt al futuro
   * (sin catch-up de corridas perdidas por pausa) y audita.
   */
  async update(
    key: string,
    actorId: string,
    patch: { cronExpr?: string; timezone?: string; enabled?: boolean },
  ) {
    const job = await this.prisma.scheduledJob.findUnique({ where: { key } });
    if (!job) throw new NotFoundException(`job ${key} no existe`);
    const cronExpr = patch.cronExpr ?? job.cronExpr;
    const timezone = patch.timezone ?? job.timezone;
    const next = nextRunAt(cronExpr, timezone);
    if (!next) {
      throw new BadRequestException(
        `expresión cron inválida: ${cronExpr} (${timezone})`,
      );
    }
    const recompute =
      patch.cronExpr !== undefined ||
      patch.timezone !== undefined ||
      patch.enabled === true;
    const updated = await this.prisma.scheduledJob.update({
      where: { key },
      data: {
        cronExpr,
        timezone,
        enabled: patch.enabled ?? job.enabled,
        nextRunAt: recompute ? next : job.nextRunAt,
      },
    });
    await this.audit(actorId, "JOB_UPDATE", job.id, {
      prev: {
        cronExpr: job.cronExpr,
        timezone: job.timezone,
        enabled: job.enabled,
      },
      next: { cronExpr, timezone, enabled: updated.enabled },
    });
    return updated;
  }

  /** Corrida manual: JobRun MANUAL + handler en background (no await). */
  async runNow(key: string, actorId: string) {
    const job = await this.prisma.scheduledJob.findUnique({ where: { key } });
    if (!job) throw new NotFoundException(`job ${key} no existe`);
    if (job.orphaned) {
      throw new ConflictException(`job ${key} sin handler en este deploy`);
    }
    if (job.runningRunId) {
      throw new ConflictException(`job ${key} ya tiene una corrida activa`);
    }
    const run = await this.execute(job, "MANUAL", actorId, true);
    if (!run) {
      // Carrera perdida contra otra instancia entre el chequeo y el claim.
      throw new ConflictException(`job ${key} ya tiene una corrida activa`);
    }
    await this.audit(actorId, "JOB_RUN_MANUAL", job.id, { key });
    return run;
  }

  /** Tick del runner: dispara jobs enabled con nextRunAt vencido. */
  async tick(now = new Date()): Promise<void> {
    const due = await this.prisma.scheduledJob.findMany({
      where: { enabled: true, orphaned: false, nextRunAt: { lte: now } },
    });
    for (const job of due) {
      if (job.runningRunId) continue;
      await this.execute(job, "CRON").catch((e: unknown) => {
        this.logger.error(
          `job ${job.key} falló fuera del JobRun`,
          e instanceof Error ? e.stack : String(e),
        );
      });
    }
  }

  /**
   * Ciclo de vida del JobRun: RUNNING → handler → OK|ERROR, contadores
   * a meta, nextRunAt recalculado al futuro. `background` = no await.
   */
  private async execute(
    job: Pick<
      ScheduledJob,
      "id" | "key" | "cronExpr" | "timezone" | "enabled" | "nextRunAt"
    >,
    trigger: "CRON" | "MANUAL",
    actorId?: string,
    background = false,
  ) {
    const reg = this.registry.get(job.key);
    const run = await this.prisma.jobRun.create({
      data: {
        jobId: job.id,
        trigger,
        actorId: actorId ?? null,
        status: "RUNNING",
        startedAt: new Date(),
      },
    });
    if (!reg) return run;
    // Claim atómico (spec platform-polish-gaps): con N instancias de
    // API a lo sumo una toma el job - el updateMany condicional hace de
    // mutex; quien pierde descarta su JobRun.
    const claim = await this.prisma.scheduledJob.updateMany({
      where: { id: job.id, runningRunId: null },
      data: { runningRunId: run.id, lastStatus: "RUNNING" },
    });
    if (claim.count === 0) {
      await this.prisma.jobRun.delete({ where: { id: run.id } });
      if (trigger === "MANUAL") {
        throw new ConflictException(
          `job ${job.key} ya tiene una corrida activa`,
        );
      }
      return null;
    }
    const finish = async () => {
      try {
        const meta = (await reg.handler()) ?? null;
        await this.prisma.jobRun.update({
          where: { id: run.id },
          data: {
            status: "OK",
            meta: (meta ?? undefined) as Prisma.InputJsonValue | undefined,
            finishedAt: new Date(),
          },
        });
        await this.prisma.scheduledJob.update({
          where: { id: job.id },
          data: {
            runningRunId: null,
            lastRunAt: new Date(),
            lastStatus: "OK",
            lastError: null,
            runCount: { increment: 1 },
            nextRunAt: job.enabled
              ? nextRunAt(job.cronExpr, job.timezone)
              : job.nextRunAt,
          },
        });
      } catch (e) {
        const error = e instanceof Error ? e.message : String(e);
        this.logger.error(`job ${job.key} falló`, e instanceof Error ? e.stack : error);
        await this.prisma.jobRun.update({
          where: { id: run.id },
          data: { status: "ERROR", error, finishedAt: new Date() },
        });
        await this.prisma.scheduledJob.update({
          where: { id: job.id },
          data: {
            runningRunId: null,
            lastRunAt: new Date(),
            lastStatus: "ERROR",
            lastError: error,
            runCount: { increment: 1 },
            nextRunAt: job.enabled
              ? nextRunAt(job.cronExpr, job.timezone)
              : job.nextRunAt,
          },
        });
      }
    };
    if (background) void finish();
    else await finish();
    return run;
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
        targetType: "ScheduledJob",
        targetId,
        payload,
      },
    });
  }
}
