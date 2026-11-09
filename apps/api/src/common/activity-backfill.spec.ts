import { describe, it, expect, beforeEach, vi } from "vitest";
import "../auth/infrastructure/auth.controller"; // rompe el ciclo session.guard ⇄ auth.controller
import { NotFoundException } from "@nestjs/common";
import type { PrismaService } from "../prisma.service";
import { UserIntelController } from "../admin/infrastructure/user-intel.controller";

// Backfill de ActivityEvent (spec platform-trials §5b) - el script es
// .cjs para correr con node plano contra la DB; acá se ejerce su núcleo
// puro planActivityBackfill con el fake prisma del patrón
// trial-lifecycle.service.spec (matchWhere reducido + filtrado en JS
// del lado del script).

type Row = Record<string, unknown>;

interface ActivityCandidate {
  type: string;
  personId?: string;
  academyId?: string;
  refType?: string;
  refId?: string;
  at?: Date;
  data?: Record<string, unknown>;
}

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { planActivityBackfill, clDayKey } = require(
  "../../scripts/backfill-activity-events.cjs",
) as {
  planActivityBackfill: (
    prisma: unknown,
    opts?: { now?: Date },
  ) => Promise<{
    events: ActivityCandidate[];
    derived: number;
    skipped: number;
  }>;
  clDayKey: (d: Date) => string;
};

const NOW = new Date("2026-11-09T18:00:00.000Z");
const T = (iso: string) => new Date(iso);

/** Subconjunto de matchWhere que usa el backfill: equality, in, startsWith. */
function matchWhere(row: Row, where: Row): boolean {
  for (const [k, cond] of Object.entries(where)) {
    const v = row[k];
    if (cond != null && typeof cond === "object" && !Array.isArray(cond)) {
      const c = cond as Row;
      if ("in" in c) {
        if (!(c.in as unknown[]).includes(v)) return false;
      } else if ("startsWith" in c) {
        if (typeof v !== "string" || !v.startsWith(c.startsWith as string))
          return false;
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
  const tables = {
    person: [] as Row[],
    personRole: [] as Row[],
    academy: [] as Row[],
    platformSubscription: [] as Row[],
    payment: [] as Row[],
    enrollment: [] as Row[],
    auditLog: [] as Row[],
    platformPromo: [] as Row[],
    platformParam: [] as Row[],
    activityEvent: [] as Row[],
  };
  const findMany = (rows: Row[]) =>
    vi.fn(async ({ where, orderBy, take }: {
      where?: Row;
      orderBy?: Row;
      take?: number;
    } = {}) => {
      let out = rows.filter((r) => !where || matchWhere(r, where));
      if (orderBy?.createdAt === "desc") {
        out = [...out].sort(
          (a, b) =>
            (b.createdAt as Date).getTime() - (a.createdAt as Date).getTime(),
        );
      }
      if (take != null) out = out.slice(0, take);
      return out;
    });
  const prisma = {
    person: {
      findMany: findMany(tables.person),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
        tables.person.find((p) => p.id === where.id) ?? null,
      ),
    },
    personRole: { findMany: findMany(tables.personRole) },
    academy: { findMany: findMany(tables.academy) },
    platformSubscription: { findMany: findMany(tables.platformSubscription) },
    payment: { findMany: findMany(tables.payment) },
    enrollment: { findMany: findMany(tables.enrollment) },
    auditLog: { findMany: findMany(tables.auditLog) },
    platformPromo: { findMany: findMany(tables.platformPromo) },
    platformParam: { findMany: findMany(tables.platformParam) },
    activityEvent: { findMany: findMany(tables.activityEvent) },
  };
  return { prisma, tables };
}

const seedParams = (fx: ReturnType<typeof mkPrisma>) => {
  fx.tables.platformParam.push(
    { key: "academy_billing.trial_days", value: 15 },
    { key: "producer_pro.trial_days", value: 15 },
  );
};

describe("backfill-activity-events planActivityBackfill", () => {
  let fx: ReturnType<typeof mkPrisma>;

  beforeEach(() => {
    fx = mkPrisma();
    seedParams(fx);
  });

  it("owner ciclo completo: deriva la línea de vida en orden", async () => {
    // Dueña: registro → rol pedido → rol aprobado → trial academia →
    // ajuste admin → aviso último día → conversión (sub + 2 cobros).
    const endsAt = T("2026-10-19T03:00:00.000Z");
    const notifiedAt = T("2026-10-18T15:00:00.000Z");
    const paid1 = T("2026-10-18T20:00:00.000Z");
    const paid2 = T("2026-11-17T20:00:00.000Z");
    fx.tables.person.push({
      id: "p-owner",
      createdAt: T("2026-10-01T10:00:00.000Z"),
      proTier: "FREE",
      proTrialEndsAt: null,
      proTrialEndNotifiedAt: null,
    });
    fx.tables.personRole.push({
      id: "pr1",
      personId: "p-owner",
      role: "ACADEMY_OWNER",
      status: "APPROVED",
      createdAt: T("2026-10-02T10:00:00.000Z"),
    });
    fx.tables.auditLog.push(
      {
        action: "ROLE_APPROVE",
        targetType: "PersonRole",
        targetId: "pr1",
        payload: { personId: "p-owner", role: "ACADEMY_OWNER" },
        actorId: "adm-1",
        createdAt: T("2026-10-03T10:00:00.000Z"),
      },
      {
        action: "TRIAL_SET",
        targetType: "Academy",
        targetId: "ac1",
        payload: { prev: "2026-10-18T03:00:00.000Z", next: endsAt.toISOString() },
        actorId: "adm-1",
        createdAt: T("2026-10-10T10:00:00.000Z"),
      },
    );
    fx.tables.academy.push({
      id: "ac1",
      ownerId: "p-owner",
      createdAt: T("2026-10-04T10:00:00.000Z"),
      tier: "STUDIO",
      trialEndsAt: endsAt,
      trialEndNotifiedAt: notifiedAt,
      billingBlockedAt: null,
    });
    fx.tables.platformPromo.push({
      id: "promo-1",
      name: `trial-conv-${clDayKey(notifiedAt)}`,
    });
    fx.tables.platformSubscription.push({
      id: "sub1",
      kind: "ACADEMY",
      academyId: "ac1",
      producerId: null,
      personId: "p-owner",
      tierCode: "STUDIO",
      billingCycle: "MONTHLY",
      status: "ACTIVE",
      createdAt: T("2026-10-18T19:00:00.000Z"),
      canceledAt: null,
    });
    fx.tables.payment.push(
      {
        id: "pay1",
        personId: "p-owner",
        orderType: "PLATFORM_SUB",
        refId: "platsub_sub1_100",
        amount: 19990,
        currency: "CLP",
        status: "PAID",
        gatewayPaidAt: paid1,
        createdAt: paid1,
      },
      {
        id: "pay2",
        personId: "p-owner",
        orderType: "PLATFORM_SUB",
        refId: "platsub_sub1_101",
        amount: 19990,
        currency: "CLP",
        status: "PAID",
        gatewayPaidAt: paid2,
        createdAt: paid2,
      },
    );

    const plan = await planActivityBackfill(fx.prisma, { now: NOW });

    expect(plan.events.map((e) => e.type)).toEqual([
      "person.registered", // 10-01
      "role.requested", // 10-02
      "role.approved", // 10-03 (audit)
      "trial.started", // 10-04
      "trial.adjusted", // 10-10
      "trial.ending", // 10-18 15:00
      "trial.ended", // 10-18 20:00 (conversión antes del vencimiento)
      "sub.started", // 10-18 20:00 (primer cobro)
      "payment.paid", // pay1
      "sub.renewed", // pay2
      "payment.paid", // pay2
    ]);
    const ended = plan.events.find((e) => e.type === "trial.ended")!;
    expect(ended.data).toMatchObject({
      kind: "ACADEMY",
      outcome: "converted",
      endsAt: endsAt.toISOString(),
    });
    expect(ended.at).toEqual(paid1);
    expect(
      plan.events.find((e) => e.type === "trial.ending"),
    ).toMatchObject({ refType: "PlatformPromo", refId: "promo-1" });
    expect(
      plan.events.find((e) => e.type === "sub.started"),
    ).toMatchObject({ refType: "PlatformSubscription", refId: "sub1", at: paid1 });
    expect(
      plan.events.find((e) => e.type === "trial.adjusted")?.data,
    ).toMatchObject({ next: endsAt.toISOString(), by: "adm-1" });
  });

  it("dancer sin platsub: solo hitos de su historia real", async () => {
    // DANCER auto-aprobado (sin audit): approved sí, requested no.
    fx.tables.person.push({
      id: "p-dancer",
      createdAt: T("2026-10-01T10:00:00.000Z"),
      proTier: "FREE",
      proTrialEndsAt: null,
      proTrialEndNotifiedAt: null,
    });
    fx.tables.personRole.push({
      id: "pr-d",
      personId: "p-dancer",
      role: "DANCER",
      status: "APPROVED",
      createdAt: T("2026-10-01T10:00:00.000Z"),
    });
    fx.tables.payment.push({
      id: "pay-t",
      personId: "p-dancer",
      orderType: "TICKET",
      refId: "ticket_1",
      amount: 8000,
      currency: "CLP",
      status: "PAID",
      gatewayPaidAt: T("2026-10-05T10:00:00.000Z"),
      createdAt: T("2026-10-05T09:59:00.000Z"),
    });
    fx.tables.enrollment.push({
      id: "enr1",
      personId: "p-dancer",
      academyId: "ac-x",
      planId: "plan-1",
      startedAt: T("2026-10-06T10:00:00.000Z"),
    });

    const plan = await planActivityBackfill(fx.prisma, { now: NOW });

    expect(plan.events.map((e) => e.type)).toEqual([
      "person.registered",
      "role.approved",
      "payment.paid",
      "enrollment.started",
    ]);
    // Nada de trial/sub para alguien que nunca estuvo en esos flujos.
    expect(plan.events.every((e) => !e.type.startsWith("trial."))).toBe(true);
    expect(plan.events.every((e) => !e.type.startsWith("sub."))).toBe(true);
  });

  it("trial vencido sin conversión: expired con at = endsAt", async () => {
    const endsAt = T("2026-11-01T03:00:00.000Z");
    fx.tables.person.push({
      id: "p-prod",
      createdAt: T("2026-10-10T10:00:00.000Z"),
      proTier: "FREE",
      proTrialEndsAt: endsAt,
      proTrialEndNotifiedAt: T("2026-10-31T15:00:00.000Z"),
    });
    // Sin PersonRole PRODUCER (caso legado): fallback endsAt - trial_days.

    const plan = await planActivityBackfill(fx.prisma, { now: NOW });
    const types = plan.events.map((e) => e.type);

    expect(types).toContain("trial.started");
    expect(types).toContain("trial.ending");
    const ended = plan.events.find((e) => e.type === "trial.ended")!;
    expect(ended.data).toMatchObject({ kind: "PRODUCER", outcome: "expired" });
    expect(ended.at).toEqual(endsAt);
    const started = plan.events.find((e) => e.type === "trial.started")!;
    expect(started.at).toEqual(
      new Date(endsAt.getTime() - 15 * 86_400_000),
    );
  });

  it("dedup: omite lo ya emitido y la re-corrida es no-op", async () => {
    fx.tables.person.push({
      id: "p1",
      createdAt: T("2026-10-01T10:00:00.000Z"),
      proTier: "FREE",
      proTrialEndsAt: null,
      proTrialEndNotifiedAt: null,
    });
    fx.tables.academy.push({
      id: "ac1",
      ownerId: "p1",
      createdAt: T("2026-10-02T10:00:00.000Z"),
      tier: null,
      trialEndsAt: T("2026-10-20T03:00:00.000Z"),
      trialEndNotifiedAt: null,
      billingBlockedAt: null,
    });
    // El runtime ya emitió el registro y un trial.ended por ESE endsAt.
    fx.tables.activityEvent.push(
      {
        type: "person.registered",
        refType: "Person",
        refId: "p1",
        personId: "p1",
      },
      {
        type: "trial.ended",
        academyId: "ac1",
        personId: "p1",
        data: { endsAt: "2026-10-20T03:00:00.000Z" },
      },
    );

    const plan = await planActivityBackfill(fx.prisma, {
      now: T("2026-10-25T00:00:00.000Z"),
    });

    // person.registered y trial.ended(endsAt) deduplicados; queda el
    // trial.started derivado.
    expect(plan.events.map((e) => e.type)).toEqual(["trial.started"]);
    expect(plan.skipped).toBe(2);

    // Re-corrida: todo lo derivado ya está persistido → 0 nuevos.
    for (const e of plan.events) {
      fx.tables.activityEvent.push({
        type: e.type,
        refType: e.refType ?? null,
        refId: e.refId ?? null,
        personId: e.personId ?? null,
        academyId: e.academyId ?? null,
        data: e.data ?? null,
      });
    }
    const again = await planActivityBackfill(fx.prisma, {
      now: T("2026-10-25T00:00:00.000Z"),
    });
    expect(again.events).toHaveLength(0);
  });
});

describe("UserIntelController.timeline", () => {
  it("devuelve items desc con label resuelto y ref", async () => {
    const fx = mkPrisma();
    fx.tables.person.push({ id: "p1" });
    fx.tables.activityEvent.push(
      {
        id: "ev1",
        type: "person.registered",
        personId: "p1",
        refType: "Person",
        refId: "p1",
        data: {},
        createdAt: T("2026-10-01T10:00:00.000Z"),
      },
      {
        id: "ev2",
        type: "sub.started",
        personId: "p1",
        refType: "PlatformSubscription",
        refId: "s1",
        data: { tierCode: "STUDIO" },
        createdAt: T("2026-10-10T10:00:00.000Z"),
      },
    );
    const ctrl = new UserIntelController(
      fx.prisma as unknown as PrismaService,
    );

    const res = await ctrl.timeline("p1");

    expect(res.items.map((i) => i.id)).toEqual(["ev2", "ev1"]);
    expect(res.items[0]).toMatchObject({
      at: T("2026-10-10T10:00:00.000Z"),
      type: "sub.started",
      label: "Suscripción STUDIO activada",
      ref: { type: "PlatformSubscription", id: "s1" },
    });
    expect(res.items[1].label).toBe("Se registró en Omnidance");
  });

  it("404 si la persona no existe", async () => {
    const fx = mkPrisma();
    const ctrl = new UserIntelController(
      fx.prisma as unknown as PrismaService,
    );
    await expect(ctrl.timeline("nadie")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
