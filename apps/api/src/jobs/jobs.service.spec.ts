import { describe, expect, it, vi } from "vitest";
import { JobsService, nextRunAt } from "./jobs.service";
import { JobRegistry } from "./registry";

// JobsService (spec admin-jobs-mail-campaigns): la DB manda el horario.
// Reglas bajo prueba:
// - sync: upsert por key sin pisar cronExpr/enabled del admin; orphans
// - tick: solo enabled + nextRunAt vencido; JobRun RUNNING→OK|ERROR;
//   runningRunId evita solapamiento; meta del handler persiste
// - update: valida cron (400), recalcula nextRunAt, audita
// - runNow: 409 si RUNNING u orphaned; JobRun MANUAL con actorId
// - runs RUNNING stale → ERROR al sync (crash recovery)

type JobRow = Record<string, unknown>;

function mkPrisma() {
  const jobs = new Map<string, JobRow>();
  const runs: JobRow[] = [];
  const audit: JobRow[] = [];
  return {
    jobs,
    runs,
    audit,
    scheduledJob: {
      findUnique: vi.fn(async ({ where }: { where: { key?: string; id?: string } }) =>
        [...jobs.values()].find(
          (j) => j.key === where.key || j.id === where.id,
        ) ?? null,
      ),
      findMany: vi.fn(
        async ({ where }: { where: { enabled?: boolean; orphaned?: boolean; nextRunAt?: { lte: Date } } }) =>
          [...jobs.values()].filter(
            (j) =>
              (where.enabled === undefined || j.enabled === where.enabled) &&
              (where.orphaned === undefined || j.orphaned === where.orphaned) &&
              (!where.nextRunAt ||
                (j.nextRunAt instanceof Date && j.nextRunAt <= where.nextRunAt.lte)),
          ),
      ),
      create: vi.fn(async ({ data }: { data: JobRow }) => {
        const row: JobRow = {
          enabled: true,
          orphaned: false,
          runCount: 0,
          timezone: "America/Santiago",
          ...data,
          id: `job-${jobs.size}`,
        };
        jobs.set(row.key as string, row);
        return row;
      }),
      update: vi.fn(
        async ({ where, data }: { where: { key?: string; id?: string }; data: JobRow }) => {
          const row = [...jobs.values()].find(
            (j) => j.key === where.key || j.id === where.id,
          );
          if (!row) throw new Error("not found");
          if (data.runCount && typeof data.runCount === "object") {
            row.runCount = (row.runCount as number) + 1;
            const { runCount: _rc, ...rest } = data;
            Object.assign(row, rest);
          } else {
            Object.assign(row, data);
          }
          return row;
        },
      ),
      updateMany: vi.fn(
        async ({ where, data }: { where: { key?: { notIn: string[] }; runningRunId?: { not: null }; orphaned?: boolean }; data: JobRow }) => {
          for (const row of jobs.values()) {
            if (where.key?.notIn && where.key.notIn.includes(row.key as string)) continue;
            if (where.orphaned !== undefined && row.orphaned !== where.orphaned) continue;
            if (where.runningRunId?.not !== undefined && row.runningRunId == null) continue;
            Object.assign(row, data);
          }
          return { count: 0 };
        },
      ),
    },
    jobRun: {
      create: vi.fn(async ({ data }: { data: JobRow }) => {
        const row = { ...data, id: `run-${runs.length}` };
        runs.push(row);
        return row;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: JobRow }) => {
        const row = runs.find((r) => r.id === where.id);
        Object.assign(row!, data);
        return row;
      }),
      updateMany: vi.fn(async ({ data }: { data: JobRow }) => {
        for (const row of runs) {
          if (row.status === "RUNNING") Object.assign(row, data);
        }
        return { count: 0 };
      }),
      findMany: vi.fn(async () => [...runs].reverse()),
    },
    auditLog: {
      create: vi.fn(async ({ data }: { data: JobRow }) => {
        audit.push(data);
        return data;
      }),
    },
  };
}

const mkService = () => {
  const prisma = mkPrisma();
  const registry = new JobRegistry();
  const svc = new JobsService(prisma as never, registry);
  return { prisma, registry, svc };
};

describe("nextRunAt", () => {
  it("calcula la próxima ocurrencia respetando timezone", () => {
    const at = nextRunAt("0 9 * * *", "America/Santiago", new Date("2026-10-19T12:00:00Z"));
    expect(at).not.toBeNull();
    expect(at!.getTime()).toBeGreaterThan(Date.parse("2026-10-19T12:00:00Z"));
  });
  it("devuelve null con expresión inválida", () => {
    expect(nextRunAt("no es cron", "America/Santiago")).toBeNull();
  });
});

describe("JobsService.sync", () => {
  it("crea jobs nuevos con defaultCron y nextRunAt", async () => {
    const { prisma, registry, svc } = mkService();
    registry.register({
      key: "test.job",
      label: "Job de prueba",
      defaultCron: "0 9 * * *",
      handler: vi.fn(async () => ({})),
    });
    await svc.sync();
    const job = prisma.jobs.get("test.job")!;
    expect(job.cronExpr).toBe("0 9 * * *");
    expect(job.defaultCron).toBe("0 9 * * *");
    expect(job.nextRunAt).toBeInstanceOf(Date);
    expect(job.enabled).toBe(true);
  });

  it("no pisa cronExpr/enabled editados por el admin", async () => {
    const { prisma, registry, svc } = mkService();
    prisma.jobs.set("test.job", {
      id: "j1",
      key: "test.job",
      cronExpr: "30 6 * * *",
      enabled: false,
      timezone: "America/Santiago",
      orphaned: true,
      runCount: 5,
    });
    registry.register({
      key: "test.job",
      label: "Label nuevo",
      defaultCron: "0 9 * * *",
      handler: vi.fn(async () => ({})),
    });
    await svc.sync();
    const job = prisma.jobs.get("test.job")!;
    expect(job.cronExpr).toBe("30 6 * * *"); // DB gana
    expect(job.enabled).toBe(false);
    expect(job.label).toBe("Label nuevo");
    expect(job.orphaned).toBe(false);
  });

  it("marca orphaned los jobs sin handler en código", async () => {
    const { prisma, svc } = mkService();
    prisma.jobs.set("old.job", {
      id: "j1",
      key: "old.job",
      orphaned: false,
      enabled: true,
    });
    await svc.sync();
    expect(prisma.jobs.get("old.job")!.orphaned).toBe(true);
  });

  it("cierra corridas RUNNING stale tras un crash", async () => {
    const { prisma, svc } = mkService();
    prisma.jobs.set("j", { id: "j1", key: "j", runningRunId: "run-0" });
    prisma.runs.push({ id: "run-0", jobId: "j1", status: "RUNNING" });
    await svc.sync();
    expect(prisma.runs[0].status).toBe("ERROR");
    expect(prisma.jobs.get("j")!.runningRunId).toBeNull();
  });
});

describe("JobsService.tick", () => {
  const seedJob = (prisma: ReturnType<typeof mkPrisma>, over: JobRow = {}) => {
    prisma.jobs.set("test.job", {
      id: "j1",
      key: "test.job",
      cronExpr: "0 9 * * *",
      timezone: "America/Santiago",
      enabled: true,
      orphaned: false,
      runningRunId: null,
      runCount: 0,
      nextRunAt: new Date(Date.now() - 60_000),
      ...over,
    });
  };

  it("ejecuta un job vencido y registra JobRun OK con meta", async () => {
    const { prisma, registry, svc } = mkService();
    seedJob(prisma);
    const handler = vi.fn(async () => ({ sent: 3 }));
    registry.register({ key: "test.job", label: "t", defaultCron: "0 9 * * *", handler });
    await svc.tick();
    expect(handler).toHaveBeenCalledOnce();
    const run = prisma.runs[0];
    expect(run.status).toBe("OK");
    expect(run.trigger).toBe("CRON");
    expect(run.meta).toEqual({ sent: 3 });
    const job = prisma.jobs.get("test.job")!;
    expect(job.lastStatus).toBe("OK");
    expect(job.runCount).toBe(1);
    expect(job.runningRunId).toBeNull();
    expect((job.nextRunAt as Date).getTime()).toBeGreaterThan(Date.now());
  });

  it("registra ERROR cuando el handler lanza", async () => {
    const { prisma, registry, svc } = mkService();
    seedJob(prisma);
    registry.register({
      key: "test.job",
      label: "t",
      defaultCron: "0 9 * * *",
      handler: vi.fn(async () => {
        throw new Error("boom");
      }),
    });
    await svc.tick();
    expect(prisma.runs[0].status).toBe("ERROR");
    expect(prisma.runs[0].error).toBe("boom");
    const job = prisma.jobs.get("test.job")!;
    expect(job.lastStatus).toBe("ERROR");
    expect(job.lastError).toBe("boom");
    expect(job.runningRunId).toBeNull();
  });

  it("ignora jobs pausados, huérfanos, no vencidos o con corrida activa", async () => {
    const { prisma, registry, svc } = mkService();
    seedJob(prisma, { enabled: false });
    prisma.jobs.set("orphan", { id: "j2", key: "orphan", enabled: true, orphaned: true, nextRunAt: new Date(0) });
    prisma.jobs.set("future", { id: "j3", key: "future", enabled: true, orphaned: false, nextRunAt: new Date(Date.now() + 86_400_000) });
    prisma.jobs.set("busy", { id: "j4", key: "busy", enabled: true, orphaned: false, runningRunId: "r", nextRunAt: new Date(0) });
    for (const k of ["orphan", "future", "busy"]) {
      registry.register({ key: k, label: k, defaultCron: "* * * * *", handler: vi.fn(async () => ({})) });
    }
    const spy = vi.fn(async () => ({}));
    registry.register({ key: "test.job", label: "t", defaultCron: "0 9 * * *", handler: spy });
    await svc.tick();
    expect(spy).not.toHaveBeenCalled();
    expect(prisma.runs).toHaveLength(0);
  });
});

describe("JobsService.update", () => {
  const seedJob = (prisma: ReturnType<typeof mkPrisma>) => {
    prisma.jobs.set("test.job", {
      id: "j1",
      key: "test.job",
      cronExpr: "0 9 * * *",
      timezone: "America/Santiago",
      enabled: true,
      nextRunAt: new Date(),
    });
  };

  it("edita el horario, recalcula nextRunAt y audita", async () => {
    const { prisma, svc } = mkService();
    seedJob(prisma);
    const job = await svc.update("test.job", "admin-1", { cronExpr: "0 10 * * *" });
    expect(job.cronExpr).toBe("0 10 * * *");
    expect((job.nextRunAt as Date).getTime()).toBeGreaterThan(Date.now());
    expect(prisma.audit[0].action).toBe("JOB_UPDATE");
    expect(prisma.audit[0].actorId).toBe("admin-1");
  });

  it("rechaza una expresión inválida sin tocar el job", async () => {
    const { prisma, svc } = mkService();
    seedJob(prisma);
    await expect(
      svc.update("test.job", "admin-1", { cronExpr: "basura" }),
    ).rejects.toThrow("expresión cron inválida");
    expect(prisma.jobs.get("test.job")!.cronExpr).toBe("0 9 * * *");
  });

  it("pausar y reactivar: al reactivar recalcula nextRunAt al futuro", async () => {
    const { prisma, svc } = mkService();
    seedJob(prisma);
    const paused = await svc.update("test.job", "a", { enabled: false });
    expect(paused.enabled).toBe(false);
    // Pausa: nextRunAt queda como estaba (no catch-up de corridas perdidas).
    prisma.jobs.get("test.job")!.nextRunAt = new Date(Date.now() - 86_400_000);
    const re = await svc.update("test.job", "a", { enabled: true });
    expect(re.enabled).toBe(true);
    expect((re.nextRunAt as Date).getTime()).toBeGreaterThan(Date.now());
  });
});

describe("JobsService.runNow", () => {
  it("crea JobRun MANUAL con actorId y corre el handler", async () => {
    const { prisma, registry, svc } = mkService();
    prisma.jobs.set("test.job", {
      id: "j1",
      key: "test.job",
      cronExpr: "0 9 * * *",
      timezone: "America/Santiago",
      enabled: true,
      orphaned: false,
      runningRunId: null,
    });
    const handler = vi.fn(async () => ({ ok: 1 }));
    registry.register({ key: "test.job", label: "t", defaultCron: "0 9 * * *", handler });
    const run = await svc.runNow("test.job", "admin-1");
    expect(run.trigger).toBe("MANUAL");
    expect(run.actorId).toBe("admin-1");
    await vi.waitFor(() => expect(handler).toHaveBeenCalledOnce());
    expect(prisma.audit[0].action).toBe("JOB_RUN_MANUAL");
  });

  it("409 con corrida activa u orphaned", async () => {
    const { prisma, svc } = mkService();
    prisma.jobs.set("busy", { id: "j1", key: "busy", runningRunId: "r", orphaned: false });
    prisma.jobs.set("orphan", { id: "j2", key: "orphan", runningRunId: null, orphaned: true });
    await expect(svc.runNow("busy", "a")).rejects.toThrow("corrida activa");
    await expect(svc.runNow("orphan", "a")).rejects.toThrow("sin handler");
  });
});
