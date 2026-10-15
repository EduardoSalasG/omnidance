import { describe, it, expect, beforeEach, vi } from "vitest";
import type { PrismaService } from "../../prisma.service";
import type { NotificationsService } from "../../notifications/domain/notifications.service";
import type { ParamsService } from "../../params/params.service";
import { CrmService } from "./crm.service";

// Spec academy-score-refine: fórmula ACADEMY por componentes, caps,
// segmentos (incl. caída), breakdown persistido y atribución de compras
// por refId. FakePrisma in-memory con matching mínimo de `where`
// (mismo criterio que crm.service.spec).

type Row = Record<string, unknown>;

function matchWhere(row: Row, where: Row): boolean {
  for (const [key, cond] of Object.entries(where)) {
    const v = row[key];
    if (cond !== null && typeof cond === "object") {
      const c = cond as Row;
      if ("in" in c && !(c.in as unknown[]).includes(v)) return false;
      if ("not" in c && v === c.not) return false;
      if ("gte" in c && !((v as number | Date) >= (c.gte as number | Date)))
        return false;
      const structural = ["in", "not", "gte", "lte", "lt", "gt"].some(
        (k) => k in c,
      );
      if (!structural) {
        if (v === null || typeof v !== "object") return false;
        if (!matchWhere(v as Row, c)) return false;
      }
      continue;
    }
    if (v !== cond) return false;
  }
  return true;
}

const DAY = 86_400_000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);

class FakePrisma {
  enrollments: Row[] = [];
  attendanceRows: Row[] = []; // {personId, checkedAt, class:{slot:{academyId}}}
  membershipSubs: Row[] = [];
  paymentRows: Row[] = [];
  claimRows: Row[] = [];
  referralRows: Row[] = [];
  planRows: Row[] = []; // {id, academyId}
  classRows: Row[] = []; // {id, slot:{academyId}}
  scores: Row[] = [];
  private seq = 0;

  enrollment = {
    findMany: async ({ where }: { where: Row }) =>
      this.enrollments.filter((e) => matchWhere(e, where)),
  };
  attendance = {
    groupBy: async ({ by, where }: { by: string[]; where: Row }) => {
      const rows = this.attendanceRows.filter((r) => matchWhere(r, where));
      const byPerson = new Map<string, Row[]>();
      for (const r of rows) {
        const k = r.personId as string;
        byPerson.set(k, [...(byPerson.get(k) ?? []), r]);
      }
      return [...byPerson.entries()].map(([personId, rs]) => ({
        personId,
        _count: { _all: rs.length },
        _min: {
          checkedAt: rs.reduce(
            (m, r) => ((r.checkedAt as Date) < m ? (r.checkedAt as Date) : m),
            rs[0].checkedAt as Date,
          ),
        },
        _max: {
          checkedAt: rs.reduce(
            (m, r) => ((r.checkedAt as Date) > m ? (r.checkedAt as Date) : m),
            rs[0].checkedAt as Date,
          ),
        },
      }));
    },
    findMany: async ({ where }: { where: Row }) =>
      this.attendanceRows.filter((r) => matchWhere(r, where)),
  };
  membershipSubscription = {
    findMany: async ({ where }: { where: Row }) =>
      this.membershipSubs.filter((s) => matchWhere(s, where)),
  };
  payment = {
    findMany: async ({ where }: { where: Row }) =>
      this.paymentRows.filter((p) => matchWhere(p, where)),
  };
  paymentClaim = {
    findMany: async ({ where }: { where: Row }) =>
      this.claimRows.filter((c) => matchWhere(c, where)),
  };
  membershipPlan = {
    findMany: async ({ where }: { where: Row }) =>
      this.planRows.filter((p) => matchWhere(p, where)),
  };
  class = {
    findMany: async ({ where }: { where: Row }) =>
      this.classRows.filter((c) => matchWhere(c, where)),
  };
  referral = {
    findMany: async ({ where }: { where: Row }) =>
      this.referralRows.filter((r) => matchWhere(r, where)),
  };
  relationshipScore = {
    upsert: async ({ where, create, update }: { where: Row; create: Row; update: Row }) => {
      const k = where.actorType_actorId_personId as Row;
      const existing = this.scores.find(
        (s) =>
          s.actorType === k.actorType &&
          s.actorId === k.actorId &&
          s.personId === k.personId,
      );
      if (existing) {
        Object.assign(existing, update);
        return existing;
      }
      const row = { id: `rs-${++this.seq}`, ...create };
      this.scores.push(row);
      return row;
    },
  };
}

const ACADEMY = "acad-1";
const OTHER = "acad-2";

function scoreOf(svc_scores: Row[], personId: string) {
  return svc_scores.find((s) => s.personId === personId);
}

describe("CrmService.recomputeScores (ACADEMY)", () => {
  let prisma: FakePrisma;
  let svc: CrmService;

  beforeEach(() => {
    prisma = new FakePrisma();
    svc = new CrmService(
      prisma as unknown as PrismaService,
      { notifySafe: vi.fn(async () => ({})) } as unknown as NotificationsService,
      // getNumber devuelve el default → fórmula con pesos baseline.
      { getNumber: async (_k: string, d: number) => d } as unknown as ParamsService,
    );
  });

  function enroll(personId: string, startedDaysAgo: number, academyId = ACADEMY) {
    prisma.enrollments.push({
      id: `en-${personId}`,
      academyId,
      personId,
      status: "ACTIVE",
      startedAt: daysAgo(startedDaysAgo),
      endsAt: null,
      pausedAt: null,
      createdAt: daysAgo(startedDaysAgo),
    });
  }

  function attend(personId: string, daysAgoN: number, academyId = ACADEMY) {
    prisma.attendanceRows.push({
      personId,
      checkedAt: daysAgo(daysAgoN),
      class: { slot: { academyId } },
    });
  }

  it("suma componentes y persiste breakdown", async () => {
    enroll("p1", 40);
    // 8 asistencias en las últimas 8 semanas: 8×4 = 32 pts
    for (const d of [1, 3, 5, 8, 10, 12, 15, 17]) attend("p1", d);
    // semanas con racha: hace 1,2,3 semanas (checkedAt 8,10,12,15,17 cubre
    // semanas distintas aprox; el valor exacto lo fija weekIndex)
    prisma.referralRows.push({ referrerId: "p1" }, { referrerId: "p1" });
    // compra de plan hace 10 días: purchases=1 → 3 pts
    prisma.planRows.push({ id: "plan-1", academyId: ACADEMY });
    prisma.paymentRows.push({
      personId: "p1",
      status: "PAID",
      orderType: "MEMBERSHIP",
      refId: "mem_plan-1_aaaa",
      amount: 50000,
      createdAt: daysAgo(10),
    });

    const r = await svc.recomputeScores("ACADEMY", ACADEMY);
    expect(r.updated).toBe(1);
    const s = scoreOf(prisma.scores, "p1")!;
    const bd = s.breakdown as Row;
    expect(bd.attendanceRecent).toBe(8);
    expect(bd.purchases).toBe(1);
    expect(bd.referrals).toBe(2);
    expect(bd.tenure).toBe(2); // 40 días ≈ 2 meses calendario (inclusive)
    const pts = bd.points as Row;
    expect(pts.attendanceRecent).toBe(32);
    expect(pts.purchases).toBe(3);
    expect(pts.referrals).toBe(10);
    expect(s.score).toBe(
      Math.min(
        100,
        (pts.attendanceRecent as number) +
          (pts.weeklyStreak as number) +
          (pts.monthsContinuous as number) +
          (pts.purchases as number) +
          (pts.tenure as number) +
          (pts.referrals as number),
      ),
    );
    expect(s.segment).not.toBe("AT_RISK");
  });

  it("atribuye compras solo a la academia dueña del plan/clase", async () => {
    enroll("p1", 400, ACADEMY);
    prisma.planRows.push(
      { id: "plan-a", academyId: ACADEMY },
      { id: "plan-b", academyId: OTHER },
    );
    prisma.classRows.push({ id: "cls-a", slot: { academyId: ACADEMY } });
    prisma.paymentRows.push(
      // plan propio → cuenta
      { personId: "p1", status: "PAID", orderType: "MEMBERSHIP", refId: "mem_plan-a_x", amount: 30000, createdAt: daysAgo(5) },
      // plan de otra academia → no cuenta
      { personId: "p1", status: "PAID", orderType: "MEMBERSHIP", refId: "mem_plan-b_x", amount: 30000, createdAt: daysAgo(5) },
      // clase suelta de la academia → cuenta
      { personId: "p1", status: "PAID", orderType: "WORKSHOP", refId: "wks_cls-a_x", amount: 8000, createdAt: daysAgo(3) },
      // privada de la academia → cuenta (refId trae academyId)
      { personId: "p1", status: "PAID", orderType: "PRIVATE", refId: `pvt_${ACADEMY}_x`, amount: 40000, createdAt: daysAgo(2) },
      // ticket de evento → orderType fuera del set, nunca entra
      { personId: "p1", status: "PAID", orderType: "TICKET", refId: "tkt_ev__x", amount: 10000, createdAt: daysAgo(1) },
    );

    await svc.recomputeScores("ACADEMY", ACADEMY);
    const s = scoreOf(prisma.scores, "p1")!;
    const bd = s.breakdown as Row;
    expect(bd.purchases).toBe(3);
    expect(bd.spend).toBe(78000);
  });

  it("claim APPROVED cuenta una vez (no duplica con su Payment MANUAL)", async () => {
    enroll("p1", 100);
    prisma.claimRows.push({
      id: "claim-1",
      academyId: ACADEMY,
      status: "APPROVED",
      personId: "p1",
      amount: 30000,
      reviewedAt: daysAgo(4),
    });
    // El settle del claim materializó este Payment:
    prisma.paymentRows.push({
      personId: "p1",
      status: "PAID",
      orderType: "MEMBERSHIP",
      refId: "claim-claim-1",
      amount: 30000,
      createdAt: daysAgo(4),
    });

    await svc.recomputeScores("ACADEMY", ACADEMY);
    const bd = scoreOf(prisma.scores, "p1")!.breakdown as Row;
    expect(bd.purchases).toBe(1);
    expect(bd.spend).toBe(30000);
  });

  it("AT_RISK por caída de asistencia aunque vino ayer", async () => {
    enroll("p1", 300);
    // 6 asistencias hace 5-8 semanas, 1 en las últimas 4
    for (const d of [36, 39, 42, 45, 48, 51]) attend("p1", d);
    attend("p1", 10);
    await svc.recomputeScores("ACADEMY", ACADEMY);
    expect(scoreOf(prisma.scores, "p1")!.segment).toBe("AT_RISK");
  });

  it("AT_RISK por inactividad total > winback_days", async () => {
    enroll("p1", 200);
    attend("p1", 40); // última hace 40 días > 21
    await svc.recomputeScores("ACADEMY", ACADEMY);
    expect(scoreOf(prisma.scores, "p1")!.segment).toBe("AT_RISK");
  });

  it("NEW gana sobre el resto (primera actividad < 30d)", async () => {
    enroll("p1", 5);
    for (const d of [1, 2, 3]) attend("p1", d);
    await svc.recomputeScores("ACADEMY", ACADEMY);
    expect(scoreOf(prisma.scores, "p1")!.segment).toBe("NEW");
  });

  it("CORE con score ≥ umbral", async () => {
    enroll("p1", 200);
    // 16 asistencias recientes (64) + antigüedad 7m (7) ≥ 60
    for (let d = 1; d <= 50; d += 3) attend("p1", d);
    await svc.recomputeScores("ACADEMY", ACADEMY);
    const s = scoreOf(prisma.scores, "p1")!;
    expect(s.score).toBeGreaterThanOrEqual(60);
    expect(s.segment).toBe("CORE");
  });

  it("BRINGS_PEOPLE con ≥2 referrals", async () => {
    enroll("p1", 100);
    attend("p1", 3);
    prisma.referralRows.push({ referrerId: "p1" }, { referrerId: "p1" });
    await svc.recomputeScores("ACADEMY", ACADEMY);
    expect(scoreOf(prisma.scores, "p1")!.segment).toBe("BRINGS_PEOPLE");
  });
});
