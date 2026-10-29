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
    findMany: async ({ where }: { where: Row }) =>
      this.scores.filter((s) => matchWhere(s, where)),
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
  // syncSegments corre al final de cada recomputeScores; stubs vacíos
  // por defecto; el describe de segmentos los pisa con estado real.
  actorSegment = { findMany: async () => [] };
  actorSegmentMembership = {
    findMany: async () => [],
    createMany: async () => ({ count: 0 }),
    deleteMany: async () => ({ count: 0 }),
  };
  actorTag = { findMany: async () => [] };
  crmTrigger = { findMany: async () => [] };
  academy = {
    findUnique: async () => null,
    findFirst: async () => null,
    findMany: async () => [],
  };
  notification = { findFirst: async () => null };
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
    // 40 días ≈ 2-3 meses calendario (depende del límite de mes).
    expect(bd.tenure).toBeGreaterThanOrEqual(2);
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

describe("CrmService.recomputeScores (PRODUCER)", () => {
  const PRODUCER = "prod-1";
  let prisma: FakePrisma;
  let svc: CrmService;

  beforeEach(() => {
    prisma = new FakePrisma();
    svc = new CrmService(
      prisma as unknown as PrismaService,
      { notifySafe: vi.fn(async () => ({})) } as unknown as NotificationsService,
      { getNumber: async (_k: string, d: number) => d } as unknown as ParamsService,
    );
  });

  // El FakePrisma del bloque ACADEMY no modela event/checkin/series - se
  // extiende con campos mínimos aquí.
  type ProducerPrisma = FakePrisma & {
    eventRows: Row[];
    checkinRows: Row[];
    seriesRows: Row[];
  };
  function extend(p: FakePrisma): ProducerPrisma {
    const fp = p as ProducerPrisma;
    fp.eventRows = [];
    fp.checkinRows = [];
    fp.seriesRows = [];
    (fp as unknown as Row).event = {
      findMany: async ({ where }: { where: Row }) =>
        fp.eventRows.filter((e) => matchWhere(e, where)),
    };
    (fp as unknown as Row).checkin = {
      findMany: async ({ where }: { where: Row }) =>
        fp.checkinRows.filter((c) => matchWhere(c, where)),
    };
    (fp as unknown as Row).eventSeries = {
      findMany: async ({ where }: { where: Row }) =>
        fp.seriesRows.filter((s) => matchWhere(s, where)),
    };
    return fp;
  }

  let fp: ProducerPrisma;
  const ev = (id: string, daysAgoN: number) => {
    const startsAt = daysAgo(daysAgoN);
    fp.eventRows.push({ id, producerId: PRODUCER, startsAt, status: "PUBLISHED" });
    return startsAt;
  };
  const checkin = (personId: string, eventId: string, daysAgoN: number) =>
    fp.checkinRows.push({ personId, eventId, inAt: daysAgo(daysAgoN), voidedAt: null });
  const ticket = (
    personId: string,
    eventId: string,
    createdDaysAgo: number,
    amount = 10000,
  ) =>
    fp.paymentRows.push({
      personId,
      eventId,
      orderType: "TICKET",
      refId: `tkt_${eventId}__x${Math.random()}`,
      status: "PAID",
      amount,
      createdAt: daysAgo(createdDaysAgo),
    });

  it("fórmula por componentes + earlyPurchases", async () => {
    fp = extend(prisma);
    const e1 = ev("ev-1", 60);
    const e2 = ev("ev-2", 30);
    const e3 = ev("ev-3", 7);
    checkin("p1", "ev-1", 60);
    checkin("p1", "ev-2", 30);
    checkin("p1", "ev-3", 7);
    // compra de ev-3 hecha 20d antes → anticipada (early_days=3)
    ticket("p1", "ev-3", 27);
    // compra puerta de ev-2 (0 días antes) → no anticipada
    ticket("p1", "ev-2", 30);
    fp.referralRows.push({ referrerId: "p1" });

    await svc.recomputeScores("PRODUCER", PRODUCER);
    const s = scoreOf(fp.scores, "p1")!;
    const bd = s.breakdown as Row;
    const pts = bd.points as Row;
    // Nota: ev-1 a 60d queda fuera de la ventana de 8 semanas (56d).
    expect(bd.eventsRecent).toBe(2);
    expect(pts.eventsRecent).toBe(8);
    expect(bd.eventStreak).toBe(3);
    expect(pts.eventStreak).toBe(9);
    expect(bd.purchases).toBe(2);
    expect(bd.earlyPurchases).toBe(1);
    expect(pts.earlyPurchases).toBe(2);
    expect(bd.referrals).toBe(1);
    expect(s.score).toBe(
      Math.min(
        100,
        (Object.values(pts) as number[]).reduce((a, v) => a + v, 0),
      ),
    );
  });

  it("SERIES_PASS se atribuye vía seriesId del productor", async () => {
    fp = extend(prisma);
    ev("ev-1", 10);
    fp.seriesRows.push(
      { id: "ser-1", producerId: PRODUCER },
      { id: "ser-2", producerId: "otro-prod" },
    );
    checkin("p1", "ev-1", 10);
    fp.paymentRows.push(
      { personId: "p1", orderType: "SERIES_PASS", refId: "sp_ser-1_2026-10_x", status: "PAID", amount: 20000, createdAt: daysAgo(5) },
      { personId: "p1", orderType: "SERIES_PASS", refId: "sp_ser-2_2026-10_x", status: "PAID", amount: 20000, createdAt: daysAgo(5) },
    );

    await svc.recomputeScores("PRODUCER", PRODUCER);
    const bd = scoreOf(fp.scores, "p1")!.breakdown as Row;
    expect(bd.purchases).toBe(1); // solo la serie propia
    expect(bd.spend).toBe(20000);
  });

  it("AT_RISK: 0 de los últimos 2 eventos tras ≥2 de los 5 anteriores", async () => {
    fp = extend(prisma);
    for (let i = 1; i <= 7; i++) ev(`ev-${i}`, i * 10 + 5); // ev-7 más viejo
    // Asistió a ev-5, ev-6, ev-7 (antiguos); NO a ev-1 ni ev-2 (recientes)
    checkin("p1", "ev-5", 55);
    checkin("p1", "ev-6", 65);
    checkin("p1", "ev-7", 75);
    // última actividad reciente? no; 55d > 21d → AT_RISK de todas formas.
    // Para aislar la caída: pago TICKET reciente (actividad ≠ asistencia).
    ticket("p1", "ev-2", 1);

    await svc.recomputeScores("PRODUCER", PRODUCER);
    expect(scoreOf(fp.scores, "p1")!.segment).toBe("AT_RISK");
  });

  it("sin caída: asistió al último evento", async () => {
    fp = extend(prisma);
    ev("ev-1", 5);
    ev("ev-2", 35);
    ev("ev-3", 65);
    ev("ev-4", 95);
    checkin("p1", "ev-1", 5);
    checkin("p1", "ev-4", 95);
    await svc.recomputeScores("PRODUCER", PRODUCER);
    const s = scoreOf(fp.scores, "p1")!;
    expect(s.segment).not.toBe("AT_RISK");
  });
});

describe("CrmService segmentos dinámicos (crm-dynamic-segments)", () => {
  const ACAD = "acad-1";
  let prisma: FakePrisma;
  let svc: CrmService;

  // Fake completo para el sync de membresías + triggers + listPeople.
  type FullPrisma = FakePrisma & {
    actorTagRows: Row[];
    segmentRows: Row[];
    membershipRows: Row[];
    triggerRows: Row[];
    notifRows: Row[];
    academyRows: Row[];
    personRows: Row[];
  };

  function full(p: FakePrisma): FullPrisma {
    const fp = p as FullPrisma;
    fp.actorTagRows = [];
    fp.segmentRows = [];
    fp.membershipRows = [];
    fp.triggerRows = [];
    fp.notifRows = [];
    fp.academyRows = [{ id: ACAD, ownerId: "owner-1" }];
    fp.personRows = [];
    let seq = 0;

    (fp as unknown as Row).actorTag = {
      findMany: async ({ where }: { where: Row }) =>
        fp.actorTagRows.filter((t) => matchWhere(t, where)),
      findFirst: async ({ where }: { where: Row }) =>
        fp.actorTagRows.find((t) => matchWhere(t, where)) ?? null,
      create: async ({ data }: { data: Row }) => {
        const r = { id: `tag-${++seq}`, createdAt: new Date(), ...data };
        fp.actorTagRows.push(r);
        return r;
      },
      deleteMany: async ({ where }: { where: Row }) => {
        const before = fp.actorTagRows.length;
        fp.actorTagRows = fp.actorTagRows.filter((t) => !matchWhere(t, where));
        return { count: before - fp.actorTagRows.length };
      },
    };
    (fp as unknown as Row).actorSegment = {
      findMany: async ({ where }: { where: Row }) =>
        fp.segmentRows
          .filter((s) => matchWhere(s, where))
          .map((s) => ({
            ...s,
            _count: {
              members: fp.membershipRows.filter((m) => m.segmentId === s.id)
                .length,
            },
          })),
      findFirst: async ({ where }: { where: Row }) =>
        fp.segmentRows.find((s) => matchWhere(s, where)) ?? null,
      findUnique: async ({ where }: { where: Row }) =>
        fp.segmentRows.find((s) => s.id === where.id) ?? null,
      create: async ({ data }: { data: Row }) => {
        const r = {
          id: `seg-${++seq}`,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        fp.segmentRows.push(r);
        return r;
      },
      update: async ({ where, data }: { where: Row; data: Row }) => {
        const r = fp.segmentRows.find((s) => s.id === where.id)!;
        Object.assign(r, data, { updatedAt: new Date() });
        return r;
      },
      delete: async ({ where }: { where: Row }) => {
        fp.segmentRows = fp.segmentRows.filter((s) => s.id !== where.id);
        fp.membershipRows = fp.membershipRows.filter(
          (m) => m.segmentId !== where.id,
        );
        return {};
      },
    };
    (fp as unknown as Row).actorSegmentMembership = {
      findMany: async ({ where }: { where: Row }) =>
        fp.membershipRows.filter((m) => matchWhere(m, where)),
      createMany: async ({ data }: { data: Row[] }) => {
        for (const d of data) {
          fp.membershipRows.push({
            id: `mem-${++seq}`,
            since: new Date(),
            ...d,
          });
        }
        return { count: data.length };
      },
      deleteMany: async ({ where }: { where: Row }) => {
        const before = fp.membershipRows.length;
        fp.membershipRows = fp.membershipRows.filter(
          (m) => !matchWhere(m, where),
        );
        return { count: before - fp.membershipRows.length };
      },
    };
    (fp as unknown as Row).crmTrigger = {
      findMany: async ({ where }: { where: Row }) =>
        fp.triggerRows.filter((t) => matchWhere(t, where)),
    };
    (fp as unknown as Row).notification = {
      findFirst: async ({ where }: { where: Row }) => {
        const w = where as {
          personId?: string;
          type?: string;
          createdAt?: { gte?: Date };
          data?: { path?: string[]; equals?: unknown };
        };
        return (
          fp.notifRows.find((n) => {
            if (n.personId !== w.personId) return false;
            if (w.type && n.type !== w.type) return false;
            if (w.createdAt?.gte && (n.createdAt as Date) < w.createdAt.gte)
              return false;
            if (w.data?.path && w.data.equals !== undefined) {
              let v: unknown = n.data;
              for (const k of w.data.path) {
                v = (v as Row | undefined)?.[k];
              }
              if (v !== w.data.equals) return false;
            }
            return true;
          }) ?? null
        );
      },
    };
    (fp as unknown as Row).academy = {
      findUnique: async ({ where }: { where: Row }) =>
        fp.academyRows.find((a) => a.id === where.id) ?? null,
      findFirst: async ({ where }: { where: Row }) =>
        fp.academyRows.find((a) => matchWhere(a, where)) ?? null,
      findMany: async () => fp.academyRows,
    };
    (fp as unknown as Row).person = {
      findMany: async ({ where }: { where: Row }) =>
        fp.personRows.filter((p) => {
          const ids = (where?.id as Row | undefined)?.in as string[] | undefined;
          return !ids || ids.includes(p.id as string);
        }),
    };
    return fp;
  }

  let fp: FullPrisma;
  const enroll = (personId: string, daysAgoN: number) =>
    fp.enrollments.push({
      personId,
      academyId: ACAD,
      status: "ACTIVE",
      startedAt: daysAgo(daysAgoN),
    });
  const attend = (personId: string, daysAgoN: number) =>
    fp.attendanceRows.push({
      personId,
      checkedAt: daysAgo(daysAgoN),
      class: { slot: { academyId: ACAD } },
    });

  beforeEach(() => {
    prisma = new FakePrisma();
    fp = full(prisma);
    svc = new CrmService(
      fp as unknown as PrismaService,
      {
        notifySafe: vi.fn(async (personId: string, input: Row) => {
          fp.notifRows.push({ personId, createdAt: new Date(), ...input });
        }),
      } as unknown as NotificationsService,
      { getNumber: async (_k: string, d: number) => d } as unknown as ParamsService,
    );
  });

  const mkSegment = async (name: string, rules: Row) =>
    svc.createSegment("ACADEMY", ACAD, name, rules);

  it("CRUD + validación de reglas", async () => {
    const seg = await mkSegment("altos", {
      conditions: [{ field: "score", op: "gte", value: 50 }],
    });
    expect(seg.name).toBe("altos");
    await expect(
      mkSegment("altos", { conditions: [{ field: "score", op: "gte", value: 1 }] }),
    ).rejects.toThrow("ya existe");
    await expect(
      mkSegment("x", { conditions: [{ field: "campo_raro", op: "eq", value: 1 }] }),
    ).rejects.toThrow("field desconocido");
    await expect(
      mkSegment("x", { conditions: [{ field: "segment", op: "gte", value: 1 }] }),
    ).rejects.toThrow("op inválida");
    const patched = await svc.patchSegment(seg.id, {
      rules: { match: "any", conditions: [{ field: "score", op: "gte", value: 10 }] },
    });
    expect((patched.rules as Row).match).toBe("any");
  });

  it("membresía materializa + enter/exit dispara trigger una sola vez", async () => {
    // p1 con actividad alta → score alto; p2 con una asistencia vieja → bajo
    enroll("p1", 100);
    for (let i = 0; i < 8; i++) attend("p1", i * 3 + 1);
    enroll("p2", 100);
    attend("p2", 40);

    const seg = await mkSegment("altos", {
      conditions: [{ field: "score", op: "gte", value: 30 }],
    });
    fp.triggerRows.push({
      id: "t-1",
      actorType: "ACADEMY",
      actorId: ACAD,
      key: "SEGMENT_ENTER",
      active: true,
      config: {
        segmentId: seg.id,
        action: { type: "NOTIFY", title: "Bienvenido al club" },
      },
    });
    fp.triggerRows.push({
      id: "t-2",
      actorType: "ACADEMY",
      actorId: ACAD,
      key: "SEGMENT_EXIT",
      active: true,
      config: {
        segmentId: seg.id,
        action: { type: "TAG_REMOVE", tag: "alto" },
      },
    });

    await svc.recomputeScores("ACADEMY", ACAD);
    const mem1 = fp.membershipRows.filter((m) => m.segmentId === seg.id);
    const scoreP1 = scoreOf(fp.scores, "p1")!.score as number;
    const scoreP2 = scoreOf(fp.scores, "p2")!.score as number;
    expect(scoreP1).toBeGreaterThanOrEqual(30);
    expect(scoreP2).toBeLessThan(30);
    expect(mem1.map((m) => m.personId)).toEqual(["p1"]);
    // SEGMENT_ENTER notificó a p1
    const n1 = fp.notifRows.filter((n) => n.personId === "p1");
    expect(n1).toHaveLength(1);
    expect(n1[0].title).toBe("Bienvenido al club");

    // segundo recompute el mismo día: sin re-notify (dedup), sin duplicar
    await svc.recomputeScores("ACADEMY", ACAD);
    expect(fp.notifRows.filter((n) => n.personId === "p1")).toHaveLength(1);
    expect(
      fp.membershipRows.filter((m) => m.segmentId === seg.id),
    ).toHaveLength(1);

    // p1 sale del segmento → membresía se va + trigger EXIT (TAG_REMOVE)
    fp.actorTagRows.push({
      id: "tg-1",
      actorType: "ACADEMY",
      actorId: ACAD,
      personId: "p1",
      tag: "alto",
    });
    await svc.patchSegment(seg.id, {
      rules: { conditions: [{ field: "score", op: "gte", value: 200 }] },
    });
    await svc.recomputeScores("ACADEMY", ACAD);
    expect(
      fp.membershipRows.filter((m) => m.segmentId === seg.id),
    ).toHaveLength(0);
    expect(fp.actorTagRows.filter((t) => t.tag === "alto")).toHaveLength(0);
  });

  it("NOTIFY_OWNER notifica al owner de la academia una vez", async () => {
    enroll("p1", 100);
    attend("p1", 1);
    enroll("p2", 100);
    attend("p2", 2);
    const seg = await mkSegment("nuevos", {
      conditions: [{ field: "attendanceRecent", op: "gte", value: 1 }],
    });
    fp.triggerRows.push({
      id: "t-3",
      actorType: "ACADEMY",
      actorId: ACAD,
      key: "SEGMENT_ENTER",
      active: true,
      config: { segmentId: seg.id, action: { type: "NOTIFY_OWNER" } },
    });
    await svc.recomputeScores("ACADEMY", ACAD);
    const ownerNotifs = fp.notifRows.filter((n) => n.personId === "owner-1");
    expect(ownerNotifs).toHaveLength(1);
    expect((ownerNotifs[0].data as Row).count).toBe(2);
    // personas NO reciben notify con NOTIFY_OWNER
    expect(fp.notifRows.filter((n) => n.personId === "p1")).toHaveLength(0);
  });

  it("listPeople?segmentId filtra por membresía y preview evalúa sin persistir", async () => {
    enroll("p1", 100);
    for (let i = 0; i < 6; i++) attend("p1", i * 2 + 1);
    enroll("p2", 100);
    attend("p2", 45);
    fp.personRows.push({ id: "p1", name: "Ana" }, { id: "p2", name: "Bruno" });
    await svc.recomputeScores("ACADEMY", ACAD);

    const rules = {
      conditions: [{ field: "attendanceRecent", op: "gte", value: 4 }],
    };
    const prev = await svc.previewSegmentRules("ACADEMY", ACAD, rules);
    expect(prev.count).toBe(1);
    expect(prev.sample).toEqual(["p1"]);

    const seg = await mkSegment("activos", rules);
    await svc.recomputeScores("ACADEMY", ACAD);
    const page = await svc.listPeople("ACADEMY", ACAD, { segmentId: seg.id });
    expect(page.total).toBe(1);
    expect(page.items[0].personId).toBe("p1");

    // segmento ajeno → 404
    await expect(
      svc.listPeople("ACADEMY", ACAD, { segmentId: "no-existe" }),
    ).rejects.toThrow("segmento no encontrado");
  });
});
