import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import type { PlatformSubscription } from "@prisma/client";
import type { PrismaService } from "../../prisma.service";
import type { ParamsService } from "../../params/params.service";
import type { NotificationsService } from "../../notifications/domain/notifications.service";
import type {
  FlowSubscription,
  PaymentGateway,
} from "../domain/ports";
import { PaymentSettlementService } from "./payment-settlement.service";
import { GatewayTransactionsService } from "../infrastructure/gateway-transactions.service";
import { PlatformSubscriptionsService } from "./platform-subscriptions.service";

// PlatformSubscriptionsService — fake SubscriptionProvider (name "FLOW"
// para pasar el check del puerto) + fake prisma stateful (mismo patrón
// que subscriptions.service.spec). Se usa el PaymentSettlementService
// REAL: el reconcile ejerce el camino completo Payment → settle →
// gracia/bloqueo de academia / proTier → PaymentEvent.

type Row = Record<string, unknown>;

const DAY = 24 * 60 * 60_000;

// Params del dominio (mismos valores que seed-common).
const PARAMS = new Map<string, number>([
  ["academy_tier.starter_max_students", 30],
  ["academy_tier.pro_max_students", 120],
  ["academy_tier.studio_max_students", 400],
  ["academy_tier.starter_monthly_clp", 19990],
  ["academy_tier.starter_semiannual_clp", 19590],
  ["academy_tier.starter_annual_clp", 19190],
  ["academy_tier.pro_monthly_clp", 39990],
  ["academy_tier.pro_semiannual_clp", 39190],
  ["academy_tier.pro_annual_clp", 38390],
  ["academy_tier.studio_monthly_clp", 79990],
  ["academy_tier.studio_semiannual_clp", 78390],
  ["academy_tier.studio_annual_clp", 76790],
  ["academy_billing.grace_days", 5],
  ["producer_tier.starter_max_monthly_clp", 2500000],
  ["producer_tier.growth_max_monthly_clp", 8000000],
  ["producer_tier.starter_monthly_clp", 9990],
  ["producer_tier.starter_semiannual_clp", 9790],
  ["producer_tier.starter_annual_clp", 9590],
  ["producer_tier.growth_monthly_clp", 19990],
  ["producer_tier.growth_semiannual_clp", 19590],
  ["producer_tier.growth_annual_clp", 19190],
]);

function mkAcademy(over: Partial<Row> = {}): Row {
  return {
    id: "ac1",
    name: "Academia X",
    ownerId: "p1",
    active: true,
    tier: null,
    billingCycle: null,
    trialEndsAt: null,
    billingGraceUntil: null,
    billingBlockedAt: null,
    ...over,
  };
}

function mkPlatSub(over: Partial<Row> = {}): PlatformSubscription {
  return {
    id: `psub-${Math.random().toString(36).slice(2, 8)}`,
    kind: "ACADEMY",
    academyId: "ac1",
    producerId: null,
    personId: "p1",
    tierCode: "STARTER",
    billingCycle: "MONTHLY",
    flowSubscriptionId: null,
    status: "PENDING_CARD",
    nextInvoiceAt: null,
    lastInvoiceId: null,
    reminderSentFor: null,
    pendingTierCode: null,
    pendingBillingCycle: null,
    createdAt: new Date(),
    canceledAt: null,
    ...over,
  } as PlatformSubscription;
}

/** Filtro Prisma-like recursivo: in/not/lt/lte/gte/startsWith/OR/AND/path+equals. */
function matchWhere(row: Row, where: Row): boolean {
  for (const [k, cond] of Object.entries(where)) {
    if (k === "OR") {
      if (
        !(cond as Row[]).some((c) => matchWhere(row, c as Row))
      )
        return false;
      continue;
    }
    if (k === "AND") {
      if (
        !(cond as Row[]).every((c) => matchWhere(row, c as Row))
      )
        return false;
      continue;
    }
    const v = row[k];
    if (cond != null && typeof cond === "object" && !Array.isArray(cond)) {
      const c = cond as Row;
      if ("path" in c && "equals" in c) {
        let cur: unknown = v;
        for (const key of c.path as string[]) {
          cur = (cur as Row | null | undefined)?.[key];
        }
        if (cur !== c.equals) return false;
      } else if ("in" in c) {
        if (!(c.in as unknown[]).includes(v)) return false;
      } else if ("not" in c) {
        if (c.not === null ? v === null : v === c.not) return false;
      } else if ("startsWith" in c) {
        if (typeof v !== "string" || !v.startsWith(c.startsWith as string))
          return false;
      } else if ("lt" in c || "lte" in c || "gte" in c || "gt" in c) {
        if (!(v instanceof Date)) return false;
        const t = v.getTime();
        if ("lt" in c && !(t < (c.lt as Date).getTime())) return false;
        if ("lte" in c && !(t <= (c.lte as Date).getTime())) return false;
        if ("gte" in c && !(t >= (c.gte as Date).getTime())) return false;
        if ("gt" in c && !(t > (c.gt as Date).getTime())) return false;
      } else if (!matchWhere((v ?? {}) as Row, c)) {
        return false;
      }
    } else if (v !== cond) {
      return false;
    }
  }
  return true;
}

function mkPrisma() {
  const payments = new Map<string, Row>();
  const events: Row[] = [];
  const platSubs: Row[] = [];
  const persons = new Map<string, Row>();
  const academies = new Map<string, Row>();
  const enrollments: Row[] = [];
  const producerEvents: Row[] = [];
  const producerSeries: Row[] = [];
  const gatewayTxs: Row[] = [];
  const sentNotifs: Row[] = [];
  let seq = 0;
  const nid = () => `id-${++seq}`;

  const sorted = (rows: Row[], orderBy?: Row) => {
    if (!orderBy?.createdAt) return rows;
    const dir = orderBy.createdAt === "desc" ? -1 : 1;
    return [...rows].sort(
      (a, b) =>
        dir *
        ((a.createdAt as Date).getTime() - (b.createdAt as Date).getTime()),
    );
  };

  const prisma = {
    platformSubscription: {
      create: vi.fn(async ({ data }: { data: Row }) => {
        const row: Row = {
          id: nid(),
          status: "PENDING_CARD",
          nextInvoiceAt: null,
          lastInvoiceId: null,
          reminderSentFor: null,
          pendingTierCode: null,
          pendingBillingCycle: null,
          createdAt: new Date(),
          canceledAt: null,
          flowSubscriptionId: null,
          academyId: null,
          producerId: null,
          ...data,
        };
        platSubs.push(row);
        return row;
      }),
      update: vi.fn(
        async ({ where, data }: { where: { id: string }; data: Row }) => {
          const row = platSubs.find((s) => s.id === where.id);
          if (row) Object.assign(row, data);
          return row;
        },
      ),
      updateMany: vi.fn(
        async ({ where, data }: { where: Row; data: Row }) => {
          let count = 0;
          for (const s of platSubs) {
            if (matchWhere(s, where)) {
              Object.assign(s, data);
              count++;
            }
          }
          return { count };
        },
      ),
      findFirst: vi.fn(
        async ({ where, orderBy }: { where: Row; orderBy?: Row }) =>
          sorted(
            platSubs.filter((s) => matchWhere(s, where)),
            orderBy,
          )[0] ?? null,
      ),
      findMany: vi.fn(
        async ({ where, orderBy }: { where?: Row; orderBy?: Row }) =>
          sorted(
            platSubs.filter((s) => !where || matchWhere(s, where)),
            orderBy,
          ),
      ),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        const row = platSubs.find((s) => s.id === where.id);
        if (!row) return null;
        // settlePlatformSub pide include:{academy:{select:{...}}}.
        const academy = academies.get(row.academyId as string) ?? null;
        return { ...row, academy };
      }),
      findUniqueOrThrow: vi.fn(
        async ({ where }: { where: { id: string } }) => {
          const row = platSubs.find((s) => s.id === where.id);
          if (!row) throw new Error("P2025");
          const academy = academies.get(row.academyId as string) ?? null;
          return { ...row, academy };
        },
      ),
    },
    academy: {
      update: vi.fn(
        async ({ where, data }: { where: { id: string }; data: Row }) => {
          const a = academies.get(where.id);
          if (a) Object.assign(a, data);
          return a;
        },
      ),
      updateMany: vi.fn(
        async ({ where, data }: { where: Row; data: Row }) => {
          let count = 0;
          for (const a of academies.values()) {
            if (matchWhere(a, where)) {
              Object.assign(a, data);
              count++;
            }
          }
          return { count };
        },
      ),
    },
    enrollment: {
      count: vi.fn(
        async ({ where }: { where: Row }) =>
          enrollments.filter((e) => matchWhere(e, where)).length,
      ),
    },
    event: {
      findMany: vi.fn(async ({ where }: { where: Row }) =>
        producerEvents
          .filter((e) => matchWhere(e, where))
          .map((e) => ({ id: e.id })),
      ),
    },
    eventSeries: {
      findMany: vi.fn(async ({ where }: { where: Row }) =>
        producerSeries
          .filter((s) => matchWhere(s, where))
          .map((s) => ({ id: s.id })),
      ),
    },
    person: {
      findUniqueOrThrow: vi.fn(async ({ where }: { where: { id: string } }) => {
        const p = persons.get(where.id);
        if (!p) throw new Error("P2025");
        return { ...p };
      }),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        const p = persons.get(where.id);
        return p ? { ...p } : null;
      }),
      findFirst: vi.fn(async ({ where }: { where: Row }) => {
        const p = [...persons.values()].find((x) => matchWhere(x, where));
        return p ? { ...p } : null;
      }),
      update: vi.fn(
        async ({ where, data }: { where: { id: string }; data: Row }) => {
          const p = persons.get(where.id);
          if (p) Object.assign(p, data);
          return p;
        },
      ),
    },
    payment: {
      create: vi.fn(async ({ data }: { data: Row }) => {
        const row: Row = {
          id: nid(),
          status: "PENDING",
          createdAt: new Date(),
          ...data,
        };
        payments.set(row.id as string, row);
        return row;
      }),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        const p = payments.get(where.id);
        return p ? { ...p } : null;
      }),
      findFirst: vi.fn(
        async ({ where, orderBy }: { where: Row; orderBy?: Row }) =>
          sorted(
            [...payments.values()].filter((p) => matchWhere(p, where)),
            orderBy,
          )[0] ?? null,
      ),
      findMany: vi.fn(
        async ({ where, orderBy }: { where: Row; orderBy?: Row }) =>
          sorted(
            [...payments.values()].filter((p) => matchWhere(p, where)),
            orderBy,
          ),
      ),
      updateMany: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string; status?: string | { not: string } };
          data: Row;
        }) => {
          const p = payments.get(where.id);
          const st = where.status;
          const ok =
            !!p &&
            (st === undefined ||
              st === p.status ||
              (typeof st === "object" && st.not !== p.status));
          if (!ok) return { count: 0 };
          Object.assign(p, data);
          return { count: 1 };
        },
      ),
    },
    paymentEvent: {
      findFirst: vi.fn(async ({ where }: { where: { paymentId: string } }) =>
        events
          .filter((e) => e.paymentId === where.paymentId)
          .sort((a, b) => (b.seq as number) - (a.seq as number))[0] ?? null,
      ),
      create: vi.fn(async ({ data }: { data: Row }) => {
        const stored = JSON.parse(JSON.stringify(data)) as Row;
        events.push(stored);
        return stored;
      }),
    },
    notification: {
      findFirst: vi.fn(async ({ where }: { where: Row }) => {
        return sentNotifs.find((n) => matchWhere(n, where)) ?? null;
      }),
    },
    personRole: { findMany: vi.fn(async () => [] as Row[]) },
    gatewayTransaction: {
      create: vi.fn(async ({ data }: { data: Row }) => {
        gatewayTxs.push(data);
        return data;
      }),
      findMany: vi.fn(async ({ where }: { where: Row }) =>
        gatewayTxs.filter((t) => matchWhere(t, where)),
      ),
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn(prisma),
    $executeRaw: vi.fn(async () => 0),
  };
  return {
    prisma,
    payments,
    events,
    platSubs,
    persons,
    academies,
    enrollments,
    producerEvents,
    producerSeries,
    gatewayTxs,
    sentNotifs,
  };
}

type Opts = { correlationId?: string } | undefined;

function mkFlow() {
  let subSeq = 0;
  const flow = {
    name: "FLOW",
    createOrder: vi.fn(),
    verifyWebhook: vi.fn(),
    ensurePlan: vi.fn(async () => undefined),
    syncPlan: vi.fn(async () => undefined),
    createCustomer: vi.fn(
      async (p: { email: string; name: string; externalId: string }) => ({
        customerId: `cus_${p.externalId}`,
      }),
    ),
    getCustomer: vi.fn(
      async (_customerId: string, _opts?: Opts) =>
        ({}) as { creditCardType?: string; status?: number },
    ),
    registerCustomerCard: vi.fn(
      async (
        _p: { customerId: string; returnUrl: string },
        _opts?: Opts,
      ) => ({
        registerUrl: "https://flow.example/register?token=rt1",
      }),
    ),
    getRegisterStatus: vi.fn(
      async (_token: string, _opts?: Opts) =>
        ({ status: 1, customerId: "cus_p1" }) as {
          status: number;
          customerId?: string;
        },
    ),
    createSubscription: vi.fn(
      async (
        p: { planId: string; customerId: string; subscriptionStart: string },
        _opts?: Opts,
      ) => ({
        subscriptionId: `fsub-${++subSeq}`,
        planId: p.planId,
        status: 1,
        next_invoice_date: "2026-11-05",
        invoices: [],
      }),
    ),
    getSubscription: vi.fn(
      async (_subscriptionId: string, _opts?: Opts) =>
        ({}) as Record<string, unknown>,
    ),
    cancelSubscription: vi.fn(
      async (_subscriptionId: string, _opts?: Opts) => undefined,
    ),
  };
  return flow;
}

function mkNotifications() {
  return {
    notifySafe: vi.fn(async (_personId: string, _input: Row) => undefined),
  };
}

const ACADEMY_ROW = mkAcademy();

function mkFlowSub(over: Partial<FlowSubscription> = {}): FlowSubscription {
  return {
    subscriptionId: "fsub-1",
    planId: "plat_academy_starter_monthly",
    status: 1,
    next_invoice_date: "2026-11-05",
    invoices: [],
    ...over,
  };
}

/** Error body de una HttpException (BadRequestException({error:...})). */
function errBody(e: unknown): Row {
  const res = (e as { getResponse?: () => unknown }).getResponse?.();
  return (res ?? {}) as Row;
}

describe("PlatformSubscriptionsService", () => {
  let fx: ReturnType<typeof mkPrisma>;
  let flow: ReturnType<typeof mkFlow>;
  let notifications: ReturnType<typeof mkNotifications>;
  let svc: PlatformSubscriptionsService;

  beforeEach(() => {
    fx = mkPrisma();
    flow = mkFlow();
    notifications = mkNotifications();
    // Dedup de mora/reminders consulta prisma.notification — el spy
    // registra cada notifySafe en sentNotifs para que findFirst lo
    // encuentre (mismo truco que subscriptions.service.spec).
    notifications.notifySafe.mockImplementation(
      async (personId: string, input: Row) => {
        fx.sentNotifs.push({ personId, ...input });
      },
    );
    fx.academies.set("ac1", { ...ACADEMY_ROW });
    fx.persons.set("p1", {
      id: "p1",
      name: "Owner Uno",
      email: "owner@example.cl",
      flowCustomerId: null,
      proTier: "FREE",
    });
    const prisma = fx.prisma as unknown as PrismaService;
    const paramsSvc = {
      getNumber: vi.fn(
        async (k: string, fallback: number) => PARAMS.get(k) ?? fallback,
      ),
    } as unknown as ParamsService;
    const notif = notifications as unknown as NotificationsService;
    svc = new PlatformSubscriptionsService(
      prisma,
      flow as unknown as PaymentGateway,
      paramsSvc,
      new PaymentSettlementService(prisma, paramsSvc, notif),
      notif,
      new GatewayTransactionsService(prisma),
    );
  });

  describe("subscribeAcademy", () => {
    const input = {
      tier: "STARTER",
      cycle: "MONTHLY" as const,
      acceptRecurring: true,
    };

    it("acceptRecurring !== true → 400", async () => {
      await expect(
        svc.subscribeAcademy("p1", ACADEMY_ROW as never, {
          ...input,
          acceptRecurring: false,
        }),
      ).rejects.toThrow(BadRequestException);
      expect(flow.createSubscription).not.toHaveBeenCalled();
      expect(fx.platSubs).toHaveLength(0);
    });

    it("tier ENTERPRISE → 400 (contratación manual)", async () => {
      await expect(
        svc.subscribeAcademy("p1", ACADEMY_ROW as never, {
          ...input,
          tier: "ENTERPRISE",
        }),
      ).rejects.toThrow(/manual|ventas/i);
      expect(fx.platSubs).toHaveLength(0);
    });

    it("alumnos activos sobre el límite del tier → 400 tier_limit", async () => {
      for (let i = 0; i < 31; i++) {
        fx.enrollments.push({
          id: `e${i}`,
          academyId: "ac1",
          status: "ACTIVE",
        });
      }
      const err = await svc
        .subscribeAcademy("p1", ACADEMY_ROW as never, input)
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(BadRequestException);
      const body = errBody(err);
      expect(body.error).toBe("tier_limit");
      expect(body.active).toBe(31);
      expect(body.max).toBe(30);
      expect(flow.createSubscription).not.toHaveBeenCalled();
      expect(fx.platSubs).toHaveLength(0);
    });

    it("TRIAL y ONLINE también cuentan como alumnos activos", async () => {
      for (let i = 0; i < 30; i++) {
        fx.enrollments.push({
          id: `t${i}`,
          academyId: "ac1",
          status: i % 2 ? "TRIAL" : "ONLINE",
        });
      }
      fx.enrollments.push({
        id: "extra",
        academyId: "ac1",
        status: "ACTIVE",
      });
      const err = await svc
        .subscribeAcademy("p1", ACADEMY_ROW as never, input)
        .catch((e: unknown) => e);
      expect(errBody(err).error).toBe("tier_limit");
      // PAUSED no cuenta: 30 activos (15 TRIAL + 15 ONLINE) + 1 ACTIVE = 31
      expect(errBody(err).active).toBe(31);
    });

    it("sin tarjeta → needs_card + paymentUrl + sub PENDING_CARD", async () => {
      fx.enrollments.push({
        id: "e1",
        academyId: "ac1",
        status: "ACTIVE",
      });
      const r = await svc.subscribeAcademy(
        "p1",
        ACADEMY_ROW as never,
        input,
      );

      expect(r.kind).toBe("needs_card");
      if (r.kind === "needs_card") {
        expect(r.paymentUrl).toBe(
          "https://flow.example/register?token=rt1",
        );
      }
      const sub = fx.platSubs[0]!;
      expect(sub.status).toBe("PENDING_CARD");
      expect(sub.kind).toBe("ACADEMY");
      expect(sub.academyId).toBe("ac1");
      expect(sub.personId).toBe("p1");
      expect(sub.tierCode).toBe("STARTER");
      expect(sub.billingCycle).toBe("MONTHLY");

      // Plan espejo compartido del tier: plat_academy_<tier>_<cycle>
      expect(flow.ensurePlan).toHaveBeenCalledWith(
        {
          planId: "plat_academy_starter_monthly",
          name: expect.stringContaining("STARTER"),
          amount: 19990,
          intervalCount: 1,
        },
        { correlationId: expect.any(String) },
      );
      // registerCustomerCard apunta al platform-customer-return propio
      const regCall = flow.registerCustomerCard.mock.calls[0]![0]!;
      expect(regCall.returnUrl).toContain(
        "/api/payments/flow/platform-customer-return",
      );
      expect(flow.createSubscription).not.toHaveBeenCalled();
    });

    it("ciclo SEMIANNUAL → plan plat_*_semiannual, amount = mensual × 6", async () => {
      await svc.subscribeAcademy("p1", ACADEMY_ROW as never, {
        ...input,
        cycle: "SEMIANNUAL",
      });
      expect(flow.ensurePlan).toHaveBeenCalledWith(
        {
          planId: "plat_academy_starter_semiannual",
          name: expect.any(String),
          amount: 19590 * 6,
          intervalCount: 6,
        },
        { correlationId: expect.any(String) },
      );
    });

    it("con tarjeta → subscription/create + ACTIVE + tier en la academia", async () => {
      flow.getCustomer.mockResolvedValue({ creditCardType: "Visa" });
      const r = await svc.subscribeAcademy(
        "p1",
        ACADEMY_ROW as never,
        input,
      );

      expect(r.kind).toBe("subscribed");
      expect(flow.createSubscription).toHaveBeenCalledWith(
        {
          planId: "plat_academy_starter_monthly",
          customerId: "cus_p1",
          subscriptionStart: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        },
        { correlationId: expect.any(String) },
      );
      const sub = fx.platSubs[0]!;
      expect(sub.status).toBe("ACTIVE");
      expect(sub.flowSubscriptionId).toBe("fsub-1");
      expect(sub.nextInvoiceAt).toEqual(new Date("2026-11-05"));
      expect(fx.academies.get("ac1")!.tier).toBe("STARTER");
      expect(fx.academies.get("ac1")!.billingCycle).toBe("MONTHLY");
      expect(notifications.notifySafe).toHaveBeenCalledWith(
        "p1",
        expect.objectContaining({ type: "academy.subscription_started" }),
      );
    });

    it("sub viva de la misma academia → 409", async () => {
      fx.platSubs.push(
        mkPlatSub({ status: "ACTIVE", flowSubscriptionId: "fsub-0" }),
      );
      await expect(
        svc.subscribeAcademy("p1", ACADEMY_ROW as never, input),
      ).rejects.toThrow(ConflictException);
      expect(flow.createSubscription).not.toHaveBeenCalled();
    });

    it("PENDING_CARD fresca del mismo scope → reutiliza la fila", async () => {
      const prev = mkPlatSub({ tierCode: "STARTER" });
      fx.platSubs.push(prev);
      const r = await svc.subscribeAcademy(
        "p1",
        ACADEMY_ROW as never,
        input,
      );
      expect(r.kind).toBe("needs_card");
      if (r.kind === "needs_card") {
        expect(r.subscriptionId).toBe(prev.id);
      }
      expect(fx.platSubs).toHaveLength(1);
    });

    it("PENDING_CARD de otra academia del mismo pagador → se cancela la vieja", async () => {
      const prev = mkPlatSub({ academyId: "ac2" });
      fx.platSubs.push(prev);
      await svc.subscribeAcademy("p1", ACADEMY_ROW as never, input);
      expect(prev.status).toBe("CANCELED");
      expect(fx.platSubs).toHaveLength(2);
    });
  });

  describe("subscribeProducer", () => {
    const input = { cycle: "MONTHLY" as const, acceptRecurring: true };

    function addSale(amount: number, daysAgo = 10) {
      fx.producerEvents.push({ id: `ev-${amount}`, producerId: "p2" });
      const payment = {
        id: `pay-${Math.random().toString(36).slice(2, 8)}`,
        orderType: "TICKET",
        eventId: `ev-${amount}`,
        refId: `tkt_x`,
        personId: "someone",
        amount,
        status: "PAID",
        createdAt: new Date(Date.now() - daysAgo * DAY),
      };
      fx.payments.set(payment.id, payment);
    }

    beforeEach(() => {
      fx.persons.set("p2", {
        id: "p2",
        name: "Productor Dos",
        email: "prod@example.cl",
        flowCustomerId: "cus_p2",
        proTier: "FREE",
      });
    });

    it("tier por facturación: media 90d ≤ starter_max → PRO_STARTER", async () => {
      // 3.000.000 brutos en 90d → 1.000.000/mes ≤ 2.500.000
      addSale(3000000);
      const r = await svc.subscribeProducer("p2", input);
      expect(r.kind).toBe("needs_card");
      const sub = fx.platSubs.find((s) => s.kind === "PRODUCER")!;
      expect(sub.tierCode).toBe("PRO_STARTER");
      expect(sub.producerId).toBe("p2");
      expect(flow.ensurePlan).toHaveBeenCalledWith(
        expect.objectContaining({
          planId: "plat_producer_pro_starter_monthly",
          amount: 9990,
        }),
        { correlationId: expect.any(String) },
      );
    });

    it("media 90d entre los topes → PRO_GROWTH", async () => {
      // 15.000.000 en 90d → 5.000.000/mes (> 2.5M, ≤ 8M)
      addSale(15000000);
      await svc.subscribeProducer("p2", input);
      const sub = fx.platSubs.find((s) => s.kind === "PRODUCER")!;
      expect(sub.tierCode).toBe("PRO_GROWTH");
    });

    it("ventas de hace >90d no cuentan en la media", async () => {
      addSale(3000000, 100); // fuera de la ventana → monthlyGross = 0
      await svc.subscribeProducer("p2", input);
      const sub = fx.platSubs.find((s) => s.kind === "PRODUCER")!;
      expect(sub.tierCode).toBe("PRO_STARTER");
    });

    it("ventas de OTRO productor no cuentan", async () => {
      fx.producerEvents.push({ id: "ev-other", producerId: "px" });
      fx.payments.set("pay-other", {
        id: "pay-other",
        orderType: "TICKET",
        eventId: "ev-other",
        refId: "tkt_y",
        amount: 90000000,
        status: "PAID",
        createdAt: new Date(),
      });
      await svc.subscribeProducer("p2", input);
      const sub = fx.platSubs.find((s) => s.kind === "PRODUCER")!;
      expect(sub.tierCode).toBe("PRO_STARTER");
    });

    it("media sobre el tope GROWTH → 400 tier_limit (PRO_BIG manual)", async () => {
      addSale(30000000); // 10M/mes > 8M
      const err = await svc
        .subscribeProducer("p2", input)
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(BadRequestException);
      expect(errBody(err).error).toBe("tier_limit");
      expect(fx.platSubs).toHaveLength(0);
    });

    it("con tarjeta → ACTIVE + Person.proTier restaurado", async () => {
      flow.getCustomer.mockResolvedValue({ creditCardType: "Visa" });
      addSale(100000);
      const r = await svc.subscribeProducer("p2", input);
      expect(r.kind).toBe("subscribed");
      expect(fx.persons.get("p2")!.proTier).toBe("PRO_STARTER");
      expect(notifications.notifySafe).toHaveBeenCalledWith(
        "p2",
        expect.objectContaining({ type: "producer.pro_started" }),
      );
    });
  });

  describe("updateAcademySubscription (PATCH)", () => {
    it("upgrade inmediato: swap Flow (cancel vieja inmediata + create nueva)", async () => {
      const sub = mkPlatSub({
        status: "ACTIVE",
        flowSubscriptionId: "fsub-old",
        tierCode: "STARTER",
        nextInvoiceAt: new Date("2026-11-05"),
      });
      fx.platSubs.push(sub);
      fx.persons.get("p1")!.flowCustomerId = "cus_p1";

      const updated = await svc.updateAcademySubscription(
        "p1",
        ACADEMY_ROW as never,
        { tier: "PRO" },
      );

      expect(flow.createSubscription).toHaveBeenCalledWith(
        expect.objectContaining({ planId: "plat_academy_pro_monthly" }),
        { correlationId: expect.any(String) },
      );
      expect(flow.cancelSubscription).toHaveBeenCalledWith(
        "fsub-old",
        expect.objectContaining({ immediate: true }),
      );
      expect(updated.status).toBe("ACTIVE");
      expect(updated.tierCode).toBe("PRO");
      expect(updated.flowSubscriptionId).not.toBe("fsub-old");
      expect(fx.academies.get("ac1")!.tier).toBe("PRO");
    });

    it("downgrade queda pendiente: cancel remota a fin de período", async () => {
      const sub = mkPlatSub({
        status: "ACTIVE",
        flowSubscriptionId: "fsub-old",
        tierCode: "PRO",
      });
      fx.platSubs.push(sub);

      const updated = await svc.updateAcademySubscription(
        "p1",
        ACADEMY_ROW as never,
        { tier: "STARTER" },
      );

      expect(updated.status).toBe("CANCEL_PENDING");
      expect(updated.tierCode).toBe("PRO"); // vigente hasta el swap
      expect(updated.pendingTierCode).toBe("STARTER");
      expect(flow.cancelSubscription).toHaveBeenCalledWith(
        "fsub-old",
        expect.not.objectContaining({ immediate: true }),
      );
      // NO hay createSubscription todavía — ocurre al fin del período
      expect(flow.createSubscription).not.toHaveBeenCalled();
    });

    it("cambio de solo ciclo queda pendiente", async () => {
      const sub = mkPlatSub({
        status: "ACTIVE",
        flowSubscriptionId: "fsub-old",
        tierCode: "PRO",
      });
      fx.platSubs.push(sub);
      const updated = await svc.updateAcademySubscription(
        "p1",
        ACADEMY_ROW as never,
        { cycle: "ANNUAL" },
      );
      expect(updated.pendingBillingCycle).toBe("ANNUAL");
      expect(updated.billingCycle).toBe("MONTHLY");
      expect(updated.status).toBe("CANCEL_PENDING");
    });

    it("PATCH al plan vigente sin pendiente → no-op (no toca Flow)", async () => {
      const sub = mkPlatSub({
        status: "ACTIVE",
        flowSubscriptionId: "fsub-old",
        tierCode: "PRO",
      });
      fx.platSubs.push(sub);
      const updated = await svc.updateAcademySubscription(
        "p1",
        ACADEMY_ROW as never,
        { tier: "PRO", cycle: "MONTHLY" },
      );
      expect(updated.status).toBe("ACTIVE");
      expect(updated.pendingTierCode).toBeNull();
      expect(flow.cancelSubscription).not.toHaveBeenCalled();
      expect(flow.createSubscription).not.toHaveBeenCalled();
    });

    it("PATCH de vuelta al plan vigente con downgrade pendiente → pending = vigente", async () => {
      const sub = mkPlatSub({
        status: "CANCEL_PENDING",
        flowSubscriptionId: "fsub-old",
        tierCode: "PRO",
        pendingTierCode: "STARTER",
        pendingBillingCycle: "MONTHLY",
        canceledAt: new Date(),
      });
      fx.platSubs.push(sub);
      const updated = await svc.updateAcademySubscription(
        "p1",
        ACADEMY_ROW as never,
        { tier: "PRO" },
      );
      // El downgrade se "deshace": pending = plan vigente (la remota ya
      // estaba cancelada a fin de período — el swap recrea el mismo plan).
      expect(updated.pendingTierCode).toBe("PRO");
      expect(updated.pendingBillingCycle).toBe("MONTHLY");
      expect(updated.status).toBe("CANCEL_PENDING");
    });

    it("downgrade que no cabe los alumnos → 400 tier_limit", async () => {
      for (let i = 0; i < 31; i++) {
        fx.enrollments.push({
          id: `e${i}`,
          academyId: "ac1",
          status: "ACTIVE",
        });
      }
      const sub = mkPlatSub({
        status: "ACTIVE",
        flowSubscriptionId: "fsub-old",
        tierCode: "PRO",
      });
      fx.platSubs.push(sub);
      const err = await svc
        .updateAcademySubscription("p1", ACADEMY_ROW as never, {
          tier: "STARTER",
        })
        .catch((e: unknown) => e);
      expect(errBody(err).error).toBe("tier_limit");
      expect(sub.pendingTierCode).toBeNull();
    });

    it("sin suscripción → 404", async () => {
      await expect(
        svc.updateAcademySubscription("p1", ACADEMY_ROW as never, {
          tier: "PRO",
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("cancelAcademySubscription", () => {
    it("ACTIVE → CANCEL_PENDING (servicio hasta fin del período)", async () => {
      const sub = mkPlatSub({
        status: "ACTIVE",
        flowSubscriptionId: "fsub-1",
      });
      fx.platSubs.push(sub);
      const r = await svc.cancelAcademySubscription("ac1");
      expect(r).toEqual({
        ok: true,
        status: "CANCEL_PENDING",
        subscriptionId: sub.id,
      });
      expect(flow.cancelSubscription).toHaveBeenCalledWith(
        "fsub-1",
        expect.not.objectContaining({ immediate: true }),
      );
      expect(sub.status).toBe("CANCEL_PENDING");
      expect(sub.canceledAt).toBeInstanceOf(Date);
      expect(notifications.notifySafe).toHaveBeenCalledWith(
        "p1",
        expect.objectContaining({
          type: "academy.subscription_canceled",
        }),
      );
    });

    it("idempotente: CANCEL_PENDING responde OK sin re-llamar a Flow", async () => {
      const sub = mkPlatSub({
        status: "CANCEL_PENDING",
        flowSubscriptionId: "fsub-1",
      });
      fx.platSubs.push(sub);
      const r = await svc.cancelAcademySubscription("ac1");
      expect(r.ok).toBe(true);
      expect(flow.cancelSubscription).not.toHaveBeenCalled();
    });

    it("sin suscripción → 404", async () => {
      await expect(svc.cancelAcademySubscription("ac1")).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("reconcileSubscription", () => {
    it("invoice pagada → Payment PLATFORM_SUB + RENEWAL_SETTLED + limpia gracia/bloqueo", async () => {
      const academy = fx.academies.get("ac1")!;
      academy.billingGraceUntil = new Date(Date.now() + 3 * DAY);
      academy.billingBlockedAt = new Date(Date.now() - DAY);
      const sub = mkPlatSub({
        status: "ACTIVE",
        flowSubscriptionId: "fsub-1",
        tierCode: "PRO",
      });
      fx.platSubs.push(sub);

      const fs = mkFlowSub({
        invoices: [
          {
            id: 501,
            status: 1,
            amount: 39990,
            payment: { status: 2, flowOrder: 991 },
          },
        ],
      });
      const settled = await svc.reconcileSubscription(sub, fs);

      expect(settled).toBe(1);
      const payment = [...fx.payments.values()].find(
        (p) => p.orderType === "PLATFORM_SUB",
      )!;
      expect(payment.refId).toBe(`platsub_${sub.id}_501`);
      expect(payment.status).toBe("PAID");
      expect(payment.amount).toBe(39990);
      expect(payment.gatewayRef).toBe("991");

      const types = fx.events
        .filter((e) => e.paymentId === payment.id)
        .map((e) => e.type);
      expect(types).toEqual([
        "ORDER_CREATED",
        "STATUS_CONFIRMED",
        "RENEWAL_SETTLED",
      ]);

      // Efectos de dominio: desbloqueo + sync del tier contratado
      expect(academy.billingGraceUntil).toBeNull();
      expect(academy.billingBlockedAt).toBeNull();
      expect(academy.tier).toBe("PRO");
      expect(sub.lastInvoiceId).toBe("501");
      expect(notifications.notifySafe).toHaveBeenCalledWith(
        "p1",
        expect.objectContaining({ type: "academy.billing_settled" }),
      );
    });

    it("invoice duplicada no crea otro Payment ni eventos", async () => {
      const sub = mkPlatSub({
        status: "ACTIVE",
        flowSubscriptionId: "fsub-1",
        lastInvoiceId: "501", // ya procesada
      });
      fx.platSubs.push(sub);
      const fs = mkFlowSub({
        invoices: [{ id: 501, status: 1, amount: 19990 }],
      });
      const settled = await svc.reconcileSubscription(sub, fs);
      expect(settled).toBe(0);
      expect(
        [...fx.payments.values()].filter(
          (p) => p.orderType === "PLATFORM_SUB",
        ),
      ).toHaveLength(0);
    });

    it("Payment PENDING huérfano del mismo invoice → reintenta el settle", async () => {
      const sub = mkPlatSub({
        status: "ACTIVE",
        flowSubscriptionId: "fsub-1",
      });
      fx.platSubs.push(sub);
      fx.payments.set("pay-orphan", {
        id: "pay-orphan",
        orderType: "PLATFORM_SUB",
        refId: `platsub_${sub.id}_502`,
        personId: "p1",
        amount: 19990,
        status: "PENDING",
        createdAt: new Date(),
      });
      const fs = mkFlowSub({
        invoices: [{ id: 502, status: 1, amount: 19990 }],
      });
      const settled = await svc.reconcileSubscription(sub, fs);
      expect(settled).toBe(1);
      expect(fx.payments.get("pay-orphan")!.status).toBe("PAID");
      // Un solo Payment para el invoice
      expect(
        [...fx.payments.values()].filter(
          (p) => p.refId === `platsub_${sub.id}_502`,
        ),
      ).toHaveLength(1);
    });

    it("mora (morose=1) → billingGraceUntil = now + grace_days + notify + RENEWAL_FAILED", async () => {
      const academy = fx.academies.get("ac1")!;
      const sub = mkPlatSub({
        status: "ACTIVE",
        flowSubscriptionId: "fsub-1",
      });
      fx.platSubs.push(sub);
      // Payment previo = anchor del RENEWAL_FAILED
      fx.payments.set("pay-prev", {
        id: "pay-prev",
        orderType: "PLATFORM_SUB",
        refId: `platsub_${sub.id}_500`,
        personId: "p1",
        amount: 19990,
        status: "PAID",
        createdAt: new Date(Date.now() - 30 * DAY),
      });
      const before = Date.now();
      const fs = mkFlowSub({
        morose: 1,
        invoices: [{ id: 600, status: 0, amount: 19990 }],
      });
      await svc.reconcileSubscription(sub, fs);

      const grace = academy.billingGraceUntil as Date;
      expect(grace).toBeInstanceOf(Date);
      expect(grace.getTime()).toBeGreaterThanOrEqual(before + 5 * DAY - 500);
      expect(grace.getTime()).toBeLessThanOrEqual(before + 5 * DAY + 5000);

      expect(fx.sentNotifs).toContainEqual(
        expect.objectContaining({
          personId: "p1",
          type: "academy.billing_grace",
        }),
      );
      const failed = fx.events.find((e) => e.type === "RENEWAL_FAILED");
      expect(failed).toBeTruthy();
      expect((failed!.payload as Row).subscriptionId).toBe(sub.id);
      expect((failed!.payload as Row).invoiceId).toBe("600");
    });

    it("mora repetida sobre la misma invoice → dedup (una notif, un evento)", async () => {
      const sub = mkPlatSub({
        status: "ACTIVE",
        flowSubscriptionId: "fsub-1",
      });
      fx.platSubs.push(sub);
      fx.payments.set("pay-prev", {
        id: "pay-prev",
        orderType: "PLATFORM_SUB",
        refId: `platsub_${sub.id}_500`,
        personId: "p1",
        amount: 19990,
        status: "PAID",
        createdAt: new Date(),
      });
      const fs = mkFlowSub({
        morose: 1,
        invoices: [{ id: 600, status: 0, amount: 19990 }],
      });
      await svc.reconcileSubscription(sub, fs);
      const grace = fx.academies.get("ac1")!.billingGraceUntil as Date;
      await svc.reconcileSubscription(sub, fs);

      expect(
        fx.sentNotifs.filter((n) => n.type === "academy.billing_grace"),
      ).toHaveLength(1);
      expect(fx.events.filter((e) => e.type === "RENEWAL_FAILED")).toHaveLength(
        1,
      );
      // La gracia NO se extiende en el segundo barrido
      expect(fx.academies.get("ac1")!.billingGraceUntil).toBe(grace);
    });

    it("remoto cancelado + cambio pendiente → swap al plan nuevo (cobra ya)", async () => {
      const sub = mkPlatSub({
        status: "CANCEL_PENDING",
        flowSubscriptionId: "fsub-old",
        tierCode: "PRO",
        pendingTierCode: "STARTER",
        pendingBillingCycle: "ANNUAL",
      });
      fx.platSubs.push(sub);
      fx.persons.get("p1")!.flowCustomerId = "cus_p1";

      const fs = mkFlowSub({
        subscriptionId: "fsub-old",
        status: 4,
      });
      await svc.reconcileSubscription(sub, fs);

      expect(flow.ensurePlan).toHaveBeenCalledWith(
        expect.objectContaining({
          planId: "plat_academy_starter_annual",
          amount: 19190 * 12,
          intervalCount: 12,
        }),
        { correlationId: expect.any(String) },
      );
      expect(flow.createSubscription).toHaveBeenCalledWith(
        expect.objectContaining({ planId: "plat_academy_starter_annual" }),
        { correlationId: expect.any(String) },
      );
      expect(sub.status).toBe("ACTIVE");
      expect(sub.tierCode).toBe("STARTER");
      expect(sub.billingCycle).toBe("ANNUAL");
      expect(sub.pendingTierCode).toBeNull();
      expect(sub.flowSubscriptionId).not.toBe("fsub-old");
      expect(fx.academies.get("ac1")!.tier).toBe("STARTER");
      expect(fx.academies.get("ac1")!.billingCycle).toBe("ANNUAL");
    });

    it("remoto cancelado sin pendiente → CANCELED", async () => {
      const sub = mkPlatSub({
        status: "CANCEL_PENDING",
        flowSubscriptionId: "fsub-old",
      });
      fx.platSubs.push(sub);
      await svc.reconcileSubscription(
        sub,
        mkFlowSub({ subscriptionId: "fsub-old", status: 4 }),
      );
      expect(sub.status).toBe("CANCELED");
      expect(flow.createSubscription).not.toHaveBeenCalled();
    });

    it("cancel_at_period_end remoto → CANCEL_PENDING", async () => {
      const sub = mkPlatSub({
        status: "ACTIVE",
        flowSubscriptionId: "fsub-1",
      });
      fx.platSubs.push(sub);
      await svc.reconcileSubscription(
        sub,
        mkFlowSub({ cancel_at_period_end: 1 }),
      );
      expect(sub.status).toBe("CANCEL_PENDING");
      expect(sub.canceledAt).toBeInstanceOf(Date);
    });

    it("invoice mañana → reminder una sola vez por fecha", async () => {
      const sub = mkPlatSub({
        status: "ACTIVE",
        flowSubscriptionId: "fsub-1",
      });
      fx.platSubs.push(sub);
      const tomorrow = new Date(Date.now() + 20 * 60 * 60_000);
      const fs = mkFlowSub({
        next_invoice_date: tomorrow.toISOString().slice(0, 10),
      });
      await svc.reconcileSubscription(sub, fs);
      await svc.reconcileSubscription(sub, fs);
      expect(
        fx.sentNotifs.filter((n) => n.type === "academy.billing_reminder"),
      ).toHaveLength(1);
      expect(sub.reminderSentFor).toBeTruthy();
    });

    it("renewal settled de productor → Person.proTier restaurado", async () => {
      fx.persons.get("p1")!.proTier = "FREE";
      const sub = mkPlatSub({
        kind: "PRODUCER",
        academyId: null,
        producerId: "p1",
        tierCode: "PRO_GROWTH",
        status: "ACTIVE",
        flowSubscriptionId: "fsub-1",
      });
      fx.platSubs.push(sub);
      const fs = mkFlowSub({
        invoices: [{ id: 700, status: 1, amount: 19990 }],
      });
      await svc.reconcileSubscription(sub, fs);
      expect(fx.persons.get("p1")!.proTier).toBe("PRO_GROWTH");
      expect(notifications.notifySafe).toHaveBeenCalledWith(
        "p1",
        expect.objectContaining({ type: "producer.pro_settled" }),
      );
    });

    it("mora de productor → notify pro_renewal_failed (sin gracia de academia)", async () => {
      const sub = mkPlatSub({
        kind: "PRODUCER",
        academyId: null,
        producerId: "p1",
        status: "ACTIVE",
        flowSubscriptionId: "fsub-1",
      });
      fx.platSubs.push(sub);
      await svc.reconcileSubscription(
        sub,
        mkFlowSub({ morose: 1, invoices: [{ id: 800, status: 0, amount: 9990 }] }),
      );
      expect(
        fx.sentNotifs.filter((n) => n.type === "producer.pro_renewal_failed"),
      ).toHaveLength(1);
      expect(fx.academies.get("ac1")!.billingGraceUntil).toBeNull();
    });
  });

  describe("customerReturn (platform-customer-return)", () => {
    it("token ok → reanuda la PENDING_CARD → ACTIVE + flowSubscriptionId", async () => {
      // El pagador registró su customer Flow al suscribirse.
      fx.persons.get("p1")!.flowCustomerId = "cus_p1";
      const sub = mkPlatSub({ status: "PENDING_CARD" });
      fx.platSubs.push(sub);
      const r = await svc.customerReturn("tok-1");
      expect(r).toEqual({
        ok: true,
        kind: "ACADEMY",
        academyId: "ac1",
        producerId: null,
      });
      expect(sub.status).toBe("ACTIVE");
      expect(sub.flowSubscriptionId).toBe("fsub-1");
      expect(fx.academies.get("ac1")!.tier).toBe("STARTER");
      // el INBOUND quedó auditado
      expect(fx.gatewayTxs).toContainEqual(
        expect.objectContaining({
          direction: "INBOUND_WEBHOOK",
          endpoint: "platform-customer/register-return",
        }),
      );
    });

    it("registro no completado → ok:false", async () => {
      flow.getRegisterStatus.mockResolvedValue({ status: 0 });
      fx.platSubs.push(mkPlatSub({ status: "PENDING_CARD" }));
      const r = await svc.customerReturn("tok-bad");
      expect(r.ok).toBe(false);
      expect(flow.createSubscription).not.toHaveBeenCalled();
    });

    it("sin sub pendiente del pagador → ok:false", async () => {
      fx.persons.get("p1")!.flowCustomerId = "cus_p1";
      const r = await svc.customerReturn("tok-1");
      expect(r.ok).toBe(false);
    });
  });

  describe("academyBillingView", () => {
    it("estado completo: tier, alumnos, límite, próximo cobro, invoices", async () => {
      const academy = fx.academies.get("ac1")!;
      academy.tier = "PRO";
      academy.billingCycle = "MONTHLY";
      const sub = mkPlatSub({
        status: "ACTIVE",
        tierCode: "PRO",
        flowSubscriptionId: "fsub-1",
        nextInvoiceAt: new Date("2026-11-05"),
      });
      fx.platSubs.push(sub);
      fx.enrollments.push(
        { id: "e1", academyId: "ac1", status: "ACTIVE" },
        { id: "e2", academyId: "ac1", status: "ONLINE" },
      );
      fx.payments.set("pay-1", {
        id: "pay-1",
        orderType: "PLATFORM_SUB",
        refId: `platsub_${sub.id}_500`,
        personId: "p1",
        amount: 39990,
        status: "PAID",
        createdAt: new Date(),
      });
      flow.getSubscription.mockResolvedValue(
        mkFlowSub() as unknown as Record<string, unknown>,
      );

      const view = await svc.academyBillingView(academy as never);
      expect(view.tier).toBe("PRO");
      expect(view.status).toBe("ACTIVE");
      expect(view.activeStudents).toBe(2);
      expect(view.maxStudents).toBe(120);
      expect(view.invoices).toHaveLength(1);
      expect(view.blocked).toBe(false);
      expect(view.graceDaysLeft).toBeNull();
    });

    it("gracia vigente → graceDaysLeft redondeado hacia arriba", async () => {
      const academy = fx.academies.get("ac1")!;
      academy.billingGraceUntil = new Date(Date.now() + 2.5 * DAY);
      const view = await svc.academyBillingView(academy as never);
      expect(view.graceDaysLeft).toBe(3);
    });
  });
});
