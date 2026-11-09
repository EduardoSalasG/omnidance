import { describe, expect, it, vi } from "vitest";
import { listPlatformTrials } from "./platform-trials";

// listPlatformTrials (spec admin/home-insights §Panel de trials): la
// lista operativa del admin - academias en trial (tier null +
// trialEndsAt set) y productores en trial (proTier FREE +
// proTrialEndsAt set). El estado es ACTIVE/EXPIRING (≤7d)/EXPIRED;
// EXPIRED exige además "sin suscripción viva" (una PENDING_CARD a
// medio checkout no está cortada, está convirtiendo). Los convertidos
// (tier set / proTier ≠ FREE) no salen: su fecha de trial quedó
// histórica pero el acceso ya lo da la suscripción.

type Row = Record<string, unknown>;

const NOW = new Date("2026-11-09T18:00:00.000Z");
const DAY = 24 * 60 * 60_000;

function matchWhere(row: Row, where: Row): boolean {
  for (const [k, cond] of Object.entries(where)) {
    if (k === "OR") {
      if (!(cond as Row[]).some((c) => matchWhere(row, c))) return false;
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
  const academies: Row[] = [];
  const persons: Row[] = [];
  const platSubs: Row[] = [];
  const prisma = {
    academy: {
      findMany: vi.fn(async ({ where }: { where?: Row }) =>
        academies.filter((a) => !where || matchWhere(a, where)),
      ),
    },
    person: {
      findMany: vi.fn(async ({ where }: { where?: Row }) =>
        persons.filter((p) => !where || matchWhere(p, where)),
      ),
    },
    platformSubscription: {
      findMany: vi.fn(async ({ where }: { where?: Row }) =>
        platSubs.filter((s) => !where || matchWhere(s, where)),
      ),
    },
  };
  return { prisma, academies, persons, platSubs };
}

const academy = (over: Partial<Row> = {}): Row => ({
  id: `ac-${Math.random().toString(36).slice(2, 8)}`,
  name: "Academia Trial",
  ownerId: "own-1",
  tier: null,
  trialEndsAt: new Date(NOW.getTime() + 10 * DAY),
  ...over,
});

const producer = (over: Partial<Row> = {}): Row => ({
  id: `p-${Math.random().toString(36).slice(2, 8)}`,
  name: "Productor Trial",
  email: "prod@example.cl",
  proTier: "FREE",
  proTrialEndsAt: new Date(NOW.getTime() + 10 * DAY),
  ...over,
});

describe("listPlatformTrials", () => {
  it("academia en trial → fila ACADEMY ACTIVE con datos del owner", async () => {
    const fx = mkPrisma();
    const a = academy();
    fx.academies.push(a);
    fx.persons.push({
      id: "own-1",
      name: "Dueña",
      email: "duena@example.cl",
      proTier: "FREE",
      proTrialEndsAt: null,
    });

    const rows = await listPlatformTrials(fx.prisma as never, NOW);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      kind: "ACADEMY",
      id: a.id,
      name: "Academia Trial",
      email: "duena@example.cl",
      role: "ACADEMY_OWNER",
      tier: "STUDIO",
      state: "ACTIVE",
      daysLeft: 10,
    });
  });

  it("vence en ≤7d → EXPIRING", async () => {
    const fx = mkPrisma();
    fx.academies.push(
      academy({ trialEndsAt: new Date(NOW.getTime() + 3 * DAY) }),
    );
    fx.persons.push({ id: "own-1", name: "Dueña", email: null });

    const rows = await listPlatformTrials(fx.prisma as never, NOW);

    expect(rows[0].state).toBe("EXPIRING");
    expect(rows[0].daysLeft).toBe(3);
  });

  it("vencido sin suscripción viva → EXPIRED con daysLeft ≤ 0", async () => {
    const fx = mkPrisma();
    fx.academies.push(
      academy({ trialEndsAt: new Date(NOW.getTime() - 2 * DAY) }),
    );
    fx.persons.push({ id: "own-1", name: "Dueña", email: null });

    const rows = await listPlatformTrials(fx.prisma as never, NOW);

    expect(rows[0].state).toBe("EXPIRED");
    expect(rows[0].daysLeft).toBeLessThanOrEqual(0);
  });

  it("convertida (tier set) no aparece aunque la fecha siga futura", async () => {
    const fx = mkPrisma();
    fx.academies.push(academy({ tier: "STUDIO" }));
    fx.persons.push({ id: "own-1", name: "Dueña", email: null });

    const rows = await listPlatformTrials(fx.prisma as never, NOW);

    expect(rows).toHaveLength(0);
  });

  it("vencida con suscripción viva (mid-checkout) → no es EXPIRED", async () => {
    const fx = mkPrisma();
    const a = academy({ trialEndsAt: new Date(NOW.getTime() - DAY) });
    fx.academies.push(a);
    fx.persons.push({ id: "own-1", name: "Dueña", email: null });
    fx.platSubs.push({
      kind: "ACADEMY",
      academyId: a.id,
      producerId: null,
      status: "PENDING_CARD",
    });

    const rows = await listPlatformTrials(fx.prisma as never, NOW);

    expect(rows).toHaveLength(0);
  });

  it("productor en trial → fila PRODUCER con tier PRO_STARTER", async () => {
    const fx = mkPrisma();
    const p = producer();
    fx.persons.push(p);

    const rows = await listPlatformTrials(fx.prisma as never, NOW);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      kind: "PRODUCER",
      id: p.id,
      name: "Productor Trial",
      email: "prod@example.cl",
      role: "PRODUCER",
      tier: "PRO_STARTER",
      state: "ACTIVE",
    });
  });

  it("productor convertido (proTier ≠ FREE) no aparece", async () => {
    const fx = mkPrisma();
    fx.persons.push(producer({ proTier: "PRO_STARTER" }));

    const rows = await listPlatformTrials(fx.prisma as never, NOW);

    expect(rows).toHaveLength(0);
  });

  it("productor con trial vencido y sub Pro viva → excluido", async () => {
    const fx = mkPrisma();
    const p = producer({
      proTrialEndsAt: new Date(NOW.getTime() - DAY),
    });
    fx.persons.push(p);
    fx.platSubs.push({
      kind: "PRODUCER",
      producerId: p.id,
      academyId: null,
      status: "ACTIVE",
    });

    const rows = await listPlatformTrials(fx.prisma as never, NOW);

    expect(rows).toHaveLength(0);
  });

  it("orden por urgencia: trialEndsAt asc (vencidos primero)", async () => {
    const fx = mkPrisma();
    const expired = academy({
      name: "Vencida",
      trialEndsAt: new Date(NOW.getTime() - DAY),
    });
    const soon = academy({
      name: "Por vencer",
      trialEndsAt: new Date(NOW.getTime() + 2 * DAY),
    });
    const later = academy({
      name: "Lejana",
      trialEndsAt: new Date(NOW.getTime() + 12 * DAY),
    });
    fx.academies.push(later, expired, soon);
    fx.persons.push({ id: "own-1", name: "Dueña", email: null });

    const rows = await listPlatformTrials(fx.prisma as never, NOW);

    expect(rows.map((r) => r.name)).toEqual([
      "Vencida",
      "Por vencer",
      "Lejana",
    ]);
  });

  it("sin trialEndsAt nunca aparece (academia sin trial histórico)", async () => {
    const fx = mkPrisma();
    fx.academies.push(academy({ trialEndsAt: null }));
    fx.persons.push({ id: "own-1", name: "Dueña", email: null });

    const rows = await listPlatformTrials(fx.prisma as never, NOW);

    expect(rows).toHaveLength(0);
  });
});
