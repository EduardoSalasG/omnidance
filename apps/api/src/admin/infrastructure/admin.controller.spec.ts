import { describe, expect, it, beforeEach, vi } from "vitest";
import "../../auth/infrastructure/auth.controller"; // rompe el ciclo session.guard ⇄ auth.controller
import { NotFoundException } from "@nestjs/common";
import { AdminController } from "./admin.controller";
import type { PrismaService } from "../../prisma.service";
import type { AuthService } from "../../auth/domain/auth.service";
import type { Mailer } from "../../auth/domain/ports";
import type { NotificationsService } from "../../notifications/domain/notifications.service";
import type { ParamsService } from "../../params/params.service";
import type { TrialLifecycleService } from "../../payments/application/trial-lifecycle.service";

// PATCH /admin/academies/:id/trial y /admin/users/:id/pro-trial (spec
// platform-trials §Ajuste admin): fija la fecha fin del trial, resetea
// la marca de dedup del correo de último día (el aviso corresponde a la
// NUEVA fecha), audita y emite ActivityEvent trial.adjusted en la misma
// tx. Extender/cortar se resuelve en caliente por featuresForAcademy -
// el endpoint solo fija la fecha.

type Row = Record<string, unknown>;

/** Subconjunto de matchWhere para la lista de trials (eq, not, in, OR). */
function matchWhereLite(row: Row, where: Row): boolean {
  for (const [k, cond] of Object.entries(where)) {
    if (k === "OR") {
      if (!(cond as Row[]).some((c) => matchWhereLite(row, c))) {
        return false;
      }
      continue;
    }
    const v = row[k];
    if (cond != null && typeof cond === "object" && !Array.isArray(cond)) {
      const c = cond as Row;
      if ("in" in c) {
        if (!(c.in as unknown[]).includes(v)) return false;
      } else if ("not" in c) {
        if (c.not === null ? v === null : v === c.not) return false;
      } else {
        return false;
      }
    } else if (v !== cond) {
      return false;
    }
  }
  return true;
}

function mkPrisma() {
  const academies = new Map<string, Row>();
  const persons = new Map<string, Row>();
  const audits: Row[] = [];
  const activities: Row[] = [];
  const prisma = {
    academy: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        const a = academies.get(where.id);
        return a ? { ...a } : null;
      }),
      findMany: vi.fn(async ({ where }: { where?: Row }) =>
        [...academies.values()].filter(
          (a) => !where || matchWhereLite(a, where),
        ),
      ),
      update: vi.fn(
        async ({ where, data }: { where: { id: string }; data: Row }) => {
          const a = academies.get(where.id);
          if (a) Object.assign(a, data);
          return a;
        },
      ),
    },
    person: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        const p = persons.get(where.id);
        return p ? { ...p } : null;
      }),
      findMany: vi.fn(async ({ where }: { where?: Row }) =>
        [...persons.values()].filter(
          (p) => !where || matchWhereLite(p, where),
        ),
      ),
      update: vi.fn(
        async ({ where, data }: { where: { id: string }; data: Row }) => {
          const p = persons.get(where.id);
          if (p) Object.assign(p, data);
          return p;
        },
      ),
    },
    platformSubscription: {
      findMany: vi.fn(async () => [] as Row[]),
    },
    auditLog: {
      create: vi.fn(async ({ data }: { data: Row }) => {
        audits.push(data);
        return data;
      }),
    },
    activityEvent: {
      create: vi.fn(async ({ data }: { data: Row }) => {
        const stored = JSON.parse(JSON.stringify(data)) as Row;
        activities.push(stored);
        return stored;
      }),
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn(prisma),
  };
  return { prisma, academies, persons, audits, activities };
}

const req = (id = "adm-1") => ({ person: { id } }) as never;

describe("AdminController - ajuste de trial", () => {
  let fx: ReturnType<typeof mkPrisma>;
  let ctrl: AdminController;

  beforeEach(() => {
    fx = mkPrisma();
    ctrl = new AdminController(
      fx.prisma as unknown as PrismaService,
      {} as AuthService,
      {} as Mailer,
      {} as NotificationsService,
      {} as ParamsService,
      {} as TrialLifecycleService,
    );
  });

  it("PATCH academies/:id/trial fija la fecha, resetea dedup y emite audit + trial.adjusted", async () => {
    fx.academies.set("ac1", {
      id: "ac1",
      ownerId: "p-owner",
      trialEndsAt: new Date("2026-11-20T00:00:00Z"),
      // El correo de último día ya salió para la fecha vieja - la nueva
      // fecha debe poder avisar de nuevo.
      trialEndNotifiedAt: new Date("2026-11-19T09:00:00Z"),
    });
    const next = "2026-12-05T00:00:00.000Z";

    const res = await ctrl.setAcademyTrial(
      "ac1",
      { endsAt: next },
      req("adm-9"),
    );

    const ac = fx.academies.get("ac1")!;
    expect(ac.trialEndsAt).toEqual(new Date(next));
    expect(ac.trialEndNotifiedAt).toBeNull();
    expect(res).toMatchObject({ ok: true });

    expect(fx.audits).toHaveLength(1);
    expect(fx.audits[0]).toMatchObject({
      actorId: "adm-9",
      action: "TRIAL_SET",
      targetType: "Academy",
      targetId: "ac1",
    });
    expect(fx.activities).toHaveLength(1);
    expect(fx.activities[0]).toMatchObject({
      type: "trial.adjusted",
      personId: "p-owner",
      academyId: "ac1",
      refType: "Academy",
      refId: "ac1",
      data: {
        prev: "2026-11-20T00:00:00.000Z",
        next,
        by: "adm-9",
      },
    });
  });

  it("acortar a fecha pasada fija el valor (el corte lo resuelve la lectura de features)", async () => {
    fx.academies.set("ac1", {
      id: "ac1",
      ownerId: "p-owner",
      trialEndsAt: new Date("2026-11-20T00:00:00Z"),
      trialEndNotifiedAt: null,
    });
    const past = "2026-11-01T00:00:00.000Z";

    await ctrl.setAcademyTrial("ac1", { endsAt: past }, req());

    expect(fx.academies.get("ac1")!.trialEndsAt).toEqual(new Date(past));
    expect(fx.activities[0].data).toMatchObject({ next: past });
  });

  it("academia inexistente → 404 sin efectos", async () => {
    await expect(
      ctrl.setAcademyTrial("nope", { endsAt: "2026-12-01" }, req()),
    ).rejects.toThrow(NotFoundException);
    expect(fx.audits).toHaveLength(0);
    expect(fx.activities).toHaveLength(0);
  });

  it("PATCH users/:id/pro-trial fija proTrialEndsAt + trial.adjusted del productor", async () => {
    fx.persons.set("p1", {
      id: "p1",
      proTrialEndsAt: null,
      proTrialEndNotifiedAt: new Date("2026-11-01T09:00:00Z"),
    });
    const next = "2026-11-25T00:00:00.000Z";

    await ctrl.setProTrial("p1", { endsAt: next }, req("adm-9"));

    const p = fx.persons.get("p1")!;
    expect(p.proTrialEndsAt).toEqual(new Date(next));
    expect(p.proTrialEndNotifiedAt).toBeNull();
    expect(fx.audits[0]).toMatchObject({
      action: "TRIAL_SET",
      targetType: "Person",
      targetId: "p1",
    });
    expect(fx.activities[0]).toMatchObject({
      type: "trial.adjusted",
      personId: "p1",
      refType: "Person",
      refId: "p1",
      data: { prev: null, next, by: "adm-9" },
    });
  });

  it("usuario inexistente → 404", async () => {
    await expect(
      ctrl.setProTrial("nope", { endsAt: "2026-12-01" }, req()),
    ).rejects.toThrow(NotFoundException);
  });

  it("GET /admin/trials devuelve la lista operativa (delega en listPlatformTrials)", async () => {
    fx.academies.set("ac1", {
      id: "ac1",
      name: "Academia Trial",
      ownerId: "p-owner",
      tier: null,
      trialEndsAt: new Date(Date.now() + 5 * 86_400_000),
    });
    fx.persons.set("p-owner", {
      id: "p-owner",
      name: "Dueña",
      email: "duena@example.cl",
      proTier: "FREE",
      proTrialEndsAt: null,
    });

    const res = await ctrl.trials();

    expect(res.items).toHaveLength(1);
    expect(res.items[0]).toMatchObject({
      kind: "ACADEMY",
      id: "ac1",
      state: "EXPIRING",
    });
  });
});
