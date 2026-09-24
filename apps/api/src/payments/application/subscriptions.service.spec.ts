import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import type { MembershipSubscription } from "@prisma/client";
import type { PrismaService } from "../../prisma.service";
import type { ParamsService } from "../../params/params.service";
import type { NotificationsService } from "../../notifications/domain/notifications.service";
import type { PaymentGateway } from "../domain/ports";
import { PaymentSettlementService } from "./payment-settlement.service";
import { GatewayTransactionsService } from "../infrastructure/gateway-transactions.service";
import { SubscriptionsService } from "./subscriptions.service";

// SubscriptionsService — fake SubscriptionProvider (name "FLOW" para pasar
// el check del puerto) + fake prisma stateful (mismo patrón que
// payment-settlement.service.spec). Se usa el PaymentSettlementService y
// GatewayTransactionsService REALES: el reconcile ejerce el camino
// completo Payment → settle → enrollment → PaymentEvent.

type Row = Record<string, unknown>;

const ACADEMY = { id: "ac1", name: "Academia X", active: true };

const PLAN_MONTHLY = {
  id: "plan1",
  academyId: "ac1",
  name: "Mensual",
  type: "MONTHLY",
  price: 10000,
  periodDays: null,
  active: true,
  flowPlanId: null as string | null,
  academy: ACADEMY,
};

function mkSub(over: Partial<Row> = {}): MembershipSubscription {
  return {
    id: `sub-${Math.random().toString(36).slice(2, 8)}`,
    personId: "p1",
    planId: "plan1",
    academyId: "ac1",
    flowSubscriptionId: null,
    status: "PENDING_CARD",
    nextInvoiceAt: null,
    lastInvoiceId: null,
    reminderSentFor: null,
    createdAt: new Date(),
    canceledAt: null,
    ...over,
  } as MembershipSubscription;
}

function matchWhere(row: Row, where: Row): boolean {
  for (const [k, cond] of Object.entries(where)) {
    const v = row[k];
    if (cond != null && typeof cond === "object" && !Array.isArray(cond)) {
      const c = cond as Row;
      if ("in" in c) {
        if (!(c.in as unknown[]).includes(v)) return false;
      } else if ("not" in c) {
        if (c.not === null ? v === null : v === c.not) return false;
      } else if ("startsWith" in c) {
        if (typeof v !== "string" || !v.startsWith(c.startsWith as string))
          return false;
      } else if (v !== cond) {
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
  const enrollments: Row[] = [];
  const subs: Row[] = [];
  const persons = new Map<string, Row>();
  const plans = new Map<string, Row>();
  const gatewayTxs: Row[] = [];
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
    membershipPlan: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        const p = plans.get(where.id);
        return p ? { ...p } : null;
      }),
      update: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: Row;
        }) => {
          const p = plans.get(where.id);
          if (p) Object.assign(p, data);
          return p;
        },
      ),
    },
    membershipSubscription: {
      create: vi.fn(async ({ data }: { data: Row }) => {
        const row: Row = {
          id: nid(),
          status: "PENDING_CARD",
          nextInvoiceAt: null,
          lastInvoiceId: null,
          reminderSentFor: null,
          createdAt: new Date(),
          canceledAt: null,
          flowSubscriptionId: null,
          ...data,
        };
        subs.push(row);
        return row;
      }),
      update: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: Row;
        }) => {
          const row = subs.find((s) => s.id === where.id);
          if (row) Object.assign(row, data);
          return row;
        },
      ),
      findFirst: vi.fn(
        async ({ where, orderBy }: { where: Row; orderBy?: Row }) => {
          const rows = sorted(
            subs.filter((s) => matchWhere(s, where)),
            orderBy,
          );
          const row = rows[0];
          return row ? { ...row, plan: plans.get(row.planId as string) } : null;
        },
      ),
      findMany: vi.fn(
        async ({ where, orderBy }: { where: Row; orderBy?: Row }) =>
          sorted(
            subs.filter((s) => matchWhere(s, where)),
            orderBy,
          ),
      ),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        const row = subs.find((s) => s.id === where.id);
        return row
          ? { ...row, plan: plans.get(row.planId as string) }
          : null;
      }),
      findUniqueOrThrow: vi.fn(
        async ({ where }: { where: { id: string } }) => {
          const row = subs.find((s) => s.id === where.id);
          if (!row) throw new Error("P2025");
          return { ...row, plan: plans.get(row.planId as string) };
        },
      ),
      updateMany: vi.fn(
        async ({ where, data }: { where: Row; data: Row }) => {
          let count = 0;
          for (const s of subs) {
            if (matchWhere(s, where)) {
              Object.assign(s, data);
              count++;
            }
          }
          return { count };
        },
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
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: Row;
        }) => {
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
      update: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: Row;
        }) => {
          const p = payments.get(where.id);
          if (p) Object.assign(p, data);
          return p;
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
    enrollment: {
      findFirst: vi.fn(
        async ({ where, orderBy }: { where: Row; orderBy?: Row }) =>
          sorted(
            enrollments.filter((e) => matchWhere(e, where)),
            orderBy,
          )[0] ?? null,
      ),
      create: vi.fn(async ({ data }: { data: Row }) => {
        const row: Row = { id: nid(), createdAt: new Date(), ...data };
        enrollments.push(row);
        return row;
      }),
      update: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: Row;
        }) => {
          const row = enrollments.find((e) => e.id === where.id);
          if (row) Object.assign(row, data);
          return row;
        },
      ),
    },
    personRole: { findMany: vi.fn(async () => [] as Row[]) },
    gatewayTransaction: {
      create: vi.fn(async ({ data }: { data: Row }) => {
        gatewayTxs.push(data);
        return data;
      }),
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn(prisma),
    $executeRaw: vi.fn(async () => 0),
  };
  return { prisma, payments, events, enrollments, subs, persons, plans, gatewayTxs };
}

type Opts = { correlationId?: string } | undefined;

function mkFlow() {
  const flow = {
    name: "FLOW",
    createOrder: vi.fn(),
    verifyWebhook: vi.fn(),
    ensurePlan: vi.fn(
      async (
        _p: {
          planId: string;
          name: string;
          amount: number;
          intervalCount: number;
        },
        _opts?: Opts,
      ) => undefined,
    ),
    syncPlan: vi.fn(
      async (
        _p: { planId: string; name: string; amount: number },
        _opts?: Opts,
      ) => undefined,
    ),
    createCustomer: vi.fn(
      async (
        p: { email: string; name: string; externalId: string },
        _opts?: Opts,
      ) => ({
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
        subscriptionId: "fsub-1",
        planId: p.planId,
        status: 1,
        next_invoice_date: "2026-10-24",
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
  return { notifySafe: vi.fn(async () => undefined) };
}

function mkParams() {
  return {
    getNumber: vi.fn(async (_k: string, fallback: number) => fallback),
  };
}

describe("SubscriptionsService", () => {
  let fx: ReturnType<typeof mkPrisma>;
  let flow: ReturnType<typeof mkFlow>;
  let notifications: ReturnType<typeof mkNotifications>;
  let svc: SubscriptionsService;

  beforeEach(() => {
    fx = mkPrisma();
    flow = mkFlow();
    notifications = mkNotifications();
    const params = mkParams();
    fx.plans.set("plan1", { ...PLAN_MONTHLY });
    fx.persons.set("p1", {
      id: "p1",
      name: "Fan Uno",
      email: "fan@example.cl",
      flowCustomerId: null,
    });
    const prisma = fx.prisma as unknown as PrismaService;
    const paramsSvc = params as unknown as ParamsService;
    const notif = notifications as unknown as NotificationsService;
    svc = new SubscriptionsService(
      prisma,
      flow as unknown as PaymentGateway,
      paramsSvc,
      new PaymentSettlementService(prisma, paramsSvc, notif),
      notif,
      new GatewayTransactionsService(prisma),
    );
  });

  describe("subscribe", () => {
    it("acceptRecurring !== true → 400", async () => {
      await expect(svc.subscribe("p1", "plan1", false)).rejects.toThrow(
        BadRequestException,
      );
      await expect(svc.subscribe("p1", "plan1", false)).rejects.toThrow(
        "recurrente",
      );
      expect(flow.createSubscription).not.toHaveBeenCalled();
    });

    it("plan no recurrente (SINGLE) → 400", async () => {
      fx.plans.set("plan-single", {
        ...PLAN_MONTHLY,
        id: "plan-single",
        type: "SINGLE",
      });
      await expect(
        svc.subscribe("p1", "plan-single", true),
      ).rejects.toThrow("recurrente");
    });

    it("plan inexistente o inactivo → 404", async () => {
      await expect(svc.subscribe("p1", "nope", true)).rejects.toThrow(
        NotFoundException,
      );
      fx.plans.set("plan-off", {
        ...PLAN_MONTHLY,
        id: "plan-off",
        active: false,
      });
      await expect(svc.subscribe("p1", "plan-off", true)).rejects.toThrow(
        NotFoundException,
      );
    });

    it("gateway sin motor de suscripciones → 400", async () => {
      const params = mkParams();
      const prisma = fx.prisma as unknown as PrismaService;
      const notif = notifications as unknown as NotificationsService;
      const stubSvc = new SubscriptionsService(
        prisma,
        { name: "STUB", createOrder: vi.fn(), verifyWebhook: vi.fn() },
        params as unknown as ParamsService,
        new PaymentSettlementService(
          prisma,
          params as unknown as ParamsService,
          notif,
        ),
        notif,
        new GatewayTransactionsService(prisma),
      );
      await expect(stubSvc.subscribe("p1", "plan1", true)).rejects.toThrow(
        "suscripciones requieren gateway Flow",
      );
    });

    it("sin tarjeta → needs_card + sub PENDING_CARD + plan/customer lazy", async () => {
      const r = await svc.subscribe("p1", "plan1", true);

      expect(r).toEqual({
        kind: "needs_card",
        registerUrl: "https://flow.example/register?token=rt1",
        subscriptionId: expect.any(String),
      });
      const sub = fx.subs[0]!;
      expect(sub.status).toBe("PENDING_CARD");
      expect(sub.planId).toBe("plan1");
      expect(sub.academyId).toBe("ac1");

      // plan espejo lazy: ensurePlan con price + fee e interval mensual
      expect(flow.ensurePlan).toHaveBeenCalledWith(
        {
          planId: "omni_plan1",
          name: "Academia X — Mensual",
          amount: 10500,
          intervalCount: 1,
        },
        { correlationId: expect.any(String) },
      );
      expect(fx.plans.get("plan1")!.flowPlanId).toBe("omni_plan1");

      // customer lazy: createCustomer + flowCustomerId persistido
      expect(flow.createCustomer).toHaveBeenCalledWith(
        { email: "fan@example.cl", name: "Fan Uno", externalId: "p1" },
        { correlationId: expect.any(String) },
      );
      expect(fx.persons.get("p1")!.flowCustomerId).toBe("cus_p1");

      // registerCustomerCard apunta al customer-return de la API
      const regCall = flow.registerCustomerCard.mock.calls[0]![0]!;
      expect(regCall.customerId).toBe("cus_p1");
      expect(regCall.returnUrl).toContain("/api/payments/flow/customer-return");

      // misma correlationId encadena todas las llamadas de la operación
      const corr = flow.ensurePlan.mock.calls[0]![1]!.correlationId;
      expect(flow.createCustomer.mock.calls[0]![1]!.correlationId).toBe(corr);
      expect(flow.registerCustomerCard.mock.calls[0]![1]!.correlationId).toBe(
        corr,
      );
      expect(flow.createSubscription).not.toHaveBeenCalled();
    });

    it("con tarjeta → subscription/create + ACTIVE + nextInvoiceAt + notify", async () => {
      flow.getCustomer.mockResolvedValue({ creditCardType: "Visa" });
      const r = await svc.subscribe("p1", "plan1", true);

      expect(r.kind).toBe("subscribed");
      expect(flow.createSubscription).toHaveBeenCalledWith(
        {
          planId: "omni_plan1",
          customerId: "cus_p1",
          subscriptionStart: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        },
        { correlationId: expect.any(String) },
      );
      const sub = fx.subs[0]!;
      expect(sub.status).toBe("ACTIVE");
      expect(sub.flowSubscriptionId).toBe("fsub-1");
      expect(sub.nextInvoiceAt).toEqual(new Date("2026-10-24"));
      expect(notifications.notifySafe).toHaveBeenCalledWith(
        "p1",
        expect.objectContaining({ type: "membership.subscription_started" }),
      );
    });

    it("suscripción viva al mismo plan → 409 (evita doble cobro)", async () => {
      fx.subs.push(mkSub({ status: "ACTIVE", flowSubscriptionId: "fsub-0" }));
      await expect(svc.subscribe("p1", "plan1", true)).rejects.toThrow(
        ConflictException,
      );
      expect(flow.createSubscription).not.toHaveBeenCalled();
    });

    it("PENDING_CARD fresca del mismo plan → reutiliza la sub (idempotente)", async () => {
      // Segundo subscribe concurrente/retry: el advisory lock serializa
      // y el que llega segundo ve la PENDING_CARD del primero — la
      // reutiliza en vez de crear otra (mismo subscriptionId, nuevo
      // registerUrl sobre el mismo customerId).
      const pending = mkSub({ status: "PENDING_CARD" });
      fx.subs.push(pending);
      const r = await svc.subscribe("p1", "plan1", true);
      expect(r).toEqual({
        kind: "needs_card",
        registerUrl: "https://flow.example/register?token=rt1",
        subscriptionId: pending.id,
      });
      expect(fx.subs).toHaveLength(1);
      expect(fx.subs[0]!.status).toBe("PENDING_CARD");
      expect(flow.registerCustomerCard).toHaveBeenCalledTimes(1);
      expect(flow.createSubscription).not.toHaveBeenCalled();
    });

    it("PENDING_CARD expirada (>15min) se cancela y se crea intento nuevo", async () => {
      const old = mkSub({
        status: "PENDING_CARD",
        createdAt: new Date(Date.now() - 20 * 60_000),
      });
      fx.subs.push(old);
      flow.getCustomer.mockResolvedValue({ creditCardType: "Visa" });
      await svc.subscribe("p1", "plan1", true);
      const oldRow = fx.subs.find((s) => s.id === old.id)!;
      expect(oldRow.status).toBe("CANCELED");
      expect(fx.subs).toHaveLength(2);
    });

    it("subscribe cancela TODAS las PENDING_CARD del person (otros planes)", async () => {
      // El token de customer-return ata a customer→person, no a sub —
      // una pendiente de otro plan no puede sobrevivir al nuevo intento.
      const other = mkSub({ planId: "plan2", status: "PENDING_CARD" });
      fx.subs.push(other);
      await svc.subscribe("p1", "plan1", true);
      const otherRow = fx.subs.find((s) => s.id === other.id)!;
      expect(otherRow.status).toBe("CANCELED");
      const alive = fx.subs.filter((s) => s.status === "PENDING_CARD");
      expect(alive).toHaveLength(1);
      expect(alive[0]!.planId).toBe("plan1");
    });

    it("claim perdido ante customer-return (sub ya ACTIVE) → subscribed sin duplicar createSubscription", async () => {
      // Carrera subscribe↔customerReturn: la PENDING_CARD se reutiliza,
      // el customer tiene tarjeta, pero entre el check y el claim el
      // return del browser ya la activó → el subscribe responde éxito
      // sin llamar subscription/create (no hay doble cobro).
      const pending = mkSub({ status: "PENDING_CARD" });
      fx.subs.push(pending);
      flow.getCustomer.mockResolvedValue({ creditCardType: "Visa" });
      const inner = fx.prisma.membershipSubscription as unknown as {
        updateMany: (a: { where: Row; data: Row }) => Promise<{ count: number }>;
      };
      const orig = inner.updateMany;
      inner.updateMany = vi.fn(
        async ({ where, data }: { where: Row; data: Row }) => {
          if (where.id === pending.id && data.status === "ACTIVATING") {
            pending.status = "ACTIVE"; // customer-return ganó la carrera
            return { count: 0 };
          }
          return orig({ where, data });
        },
      );

      const r = await svc.subscribe("p1", "plan1", true);
      expect(r).toEqual({ kind: "subscribed", subscriptionId: pending.id });
      expect(flow.createSubscription).not.toHaveBeenCalled();
    });

    it("createSubscription reporta status 4 → CANCELED, no asume ACTIVE", async () => {
      flow.getCustomer.mockResolvedValue({ creditCardType: "Visa" });
      flow.createSubscription.mockResolvedValue({
        subscriptionId: "fsub-x",
        planId: "omni_plan1",
        status: 4,
        next_invoice_date: "2026-10-24",
        invoices: [],
      });
      const r = await svc.subscribe("p1", "plan1", true);
      expect(r.kind).toBe("subscribed");
      const sub = fx.subs[0]!;
      expect(sub.status).toBe("CANCELED");
      expect(sub.flowSubscriptionId).toBe("fsub-x");
      // sin notificación de "está activa" para una sub cancelada
      expect(notifications.notifySafe).not.toHaveBeenCalled();
    });

    it("update post-createSubscription falla → cancel inmediata compensa la sub Flow huérfana", async () => {
      flow.getCustomer.mockResolvedValue({ creditCardType: "Visa" });
      const inner = fx.prisma.membershipSubscription as unknown as {
        updateMany: (a: { where: Row; data: Row }) => Promise<{ count: number }>;
      };
      const orig = inner.updateMany;
      inner.updateMany = vi.fn(
        async ({ where, data }: { where: Row; data: Row }) => {
          // la transición ACTIVATING→ACTIVE falla (DB perdió la sub)
          if (data.status === "ACTIVE") return { count: 0 };
          return orig({ where, data });
        },
      );

      await expect(svc.subscribe("p1", "plan1", true)).rejects.toThrow(
        ConflictException,
      );
      expect(flow.cancelSubscription).toHaveBeenCalledWith("fsub-1", {
        correlationId: expect.any(String),
        immediate: true,
      });
    });
  });

  describe("customerReturn", () => {
    it("registro OK → crea suscripción Flow, sub ACTIVE, INBOUND auditado", async () => {
      fx.persons.get("p1")!.flowCustomerId = "cus_p1";
      const pending = mkSub({ status: "PENDING_CARD" });
      fx.subs.push(pending);
      // el plan espejo ya existe (se creó en el subscribe original)
      fx.plans.get("plan1")!.flowPlanId = "omni_plan1";

      const r = await svc.customerReturn("tok-reg");

      expect(r).toEqual({ ok: true, academyId: "ac1" });
      expect(flow.getRegisterStatus).toHaveBeenCalledWith(
        "tok-reg",
        { correlationId: expect.any(String) },
      );
      expect(flow.createSubscription).toHaveBeenCalledWith(
        expect.objectContaining({
          planId: "omni_plan1",
          customerId: "cus_p1",
        }),
        { correlationId: expect.any(String) },
      );
      const row = fx.subs.find((s) => s.id === pending.id)!;
      expect(row.status).toBe("ACTIVE");
      expect(row.flowSubscriptionId).toBe("fsub-1");
      expect(fx.gatewayTxs[0]).toMatchObject({
        direction: "INBOUND_WEBHOOK",
        endpoint: "customer/register-return",
        ok: true,
      });
    });

    it("status !== 1 → ok:false sin crear suscripción", async () => {
      flow.getRegisterStatus.mockResolvedValue({ status: 0 });
      const r = await svc.customerReturn("tok-bad");
      expect(r).toEqual({ ok: false, academyId: null });
      expect(flow.createSubscription).not.toHaveBeenCalled();
    });
  });

  describe("cancel", () => {
    it("ACTIVE → cancelSubscription + CANCEL_PENDING + notify", async () => {
      const sub = mkSub({ status: "ACTIVE", flowSubscriptionId: "fsub-1" });
      fx.subs.push(sub);
      const r = await svc.cancel("p1", sub.id);
      expect(r.status).toBe("CANCEL_PENDING");
      expect(flow.cancelSubscription).toHaveBeenCalledWith(
        "fsub-1",
        { correlationId: expect.any(String) },
      );
      const row = fx.subs.find((s) => s.id === sub.id)!;
      expect(row.status).toBe("CANCEL_PENDING");
      expect(row.canceledAt).toBeInstanceOf(Date);
      expect(notifications.notifySafe).toHaveBeenCalledWith(
        "p1",
        expect.objectContaining({ type: "membership.subscription_canceled" }),
      );
    });

    it("idempotente: segunda cancelación no vuelve a llamar a Flow", async () => {
      const sub = mkSub({ status: "ACTIVE", flowSubscriptionId: "fsub-1" });
      fx.subs.push(sub);
      await svc.cancel("p1", sub.id);
      const r2 = await svc.cancel("p1", sub.id);
      expect(r2.status).toBe("CANCEL_PENDING");
      expect(flow.cancelSubscription).toHaveBeenCalledTimes(1);
    });

    it("PENDING_CARD → cancelación local sin llamar a Flow", async () => {
      const sub = mkSub({ status: "PENDING_CARD" });
      fx.subs.push(sub);
      const r = await svc.cancel("p1", sub.id);
      expect(r.status).toBe("CANCELED");
      expect(flow.cancelSubscription).not.toHaveBeenCalled();
    });

    it("de otra persona → 404", async () => {
      const sub = mkSub({ status: "ACTIVE", personId: "otro" });
      fx.subs.push(sub);
      await expect(svc.cancel("p1", sub.id)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("reconcileSubscription", () => {
    it("invoice pagado → Payment mem_<plan>_<inv> + settle (enrollment) + lastInvoiceId", async () => {
      const sub = mkSub({ status: "ACTIVE", flowSubscriptionId: "fsub-1" });
      fx.subs.push(sub);
      const fs = {
        subscriptionId: "fsub-1",
        planId: "omni_plan1",
        status: 1,
        next_invoice_date: "2026-10-24",
        invoices: [
          {
            id: 42,
            status: 1,
            amount: 10500,
            payment: {
              status: 2,
              flowOrder: 777,
              paymentData: { amount: 10500, fee: 335 },
            },
          },
        ],
      };

      const settled = await svc.reconcileSubscription(sub, fs as never);
      expect(settled).toBe(1);

      const payment = [...fx.payments.values()][0]!;
      expect(payment.refId).toBe("mem_plan1_42");
      expect(payment.orderType).toBe("MEMBERSHIP");
      expect(payment.status).toBe("PAID"); // settleMembership lo liquidó
      expect(payment.gatewayRef).toBe("777");
      expect(payment.gatewayFeeClp).toBe(335); // paymentData → campos gateway*

      // el settle materializó el enrollment (misma fuente de verdad)
      expect(fx.enrollments).toHaveLength(1);
      expect(fx.enrollments[0]).toMatchObject({
        academyId: "ac1",
        personId: "p1",
        planId: "plan1",
        status: "ACTIVE",
      });

      // ledger: ORDER_CREATED + STATUS_CONFIRMED + RENEWAL_SETTLED
      const types = fx.events
        .filter((e) => e.paymentId === payment.id)
        .map((e) => e.type);
      expect(types).toEqual([
        "ORDER_CREATED",
        "STATUS_CONFIRMED",
        "RENEWAL_SETTLED",
      ]);

      const row = fx.subs.find((s) => s.id === sub.id)!;
      expect(row.lastInvoiceId).toBe("42");
      expect(row.nextInvoiceAt).toEqual(new Date("2026-10-24"));
    });

    it("Payment PENDING con refId existente → reintenta el settle (I2)", async () => {
      // Una pasada anterior creó el Payment pero settleMembership falló
      // después → invoice cobrada con Payment PENDING y sin enrollment.
      // El reconcile debe retomarlo, no solo marcar la invoice.
      const sub = mkSub({ status: "ACTIVE", flowSubscriptionId: "fsub-1" });
      fx.subs.push(sub);
      fx.payments.set("pay-9", {
        id: "pay-9",
        refId: "mem_plan1_42",
        orderType: "MEMBERSHIP",
        personId: "p1",
        amount: 10500,
        fee: 0,
        net: 10500,
        gateway: "FLOW",
        status: "PENDING",
        createdAt: new Date(),
      });
      const fs = {
        subscriptionId: "fsub-1",
        planId: "omni_plan1",
        status: 1,
        invoices: [
          {
            id: 42,
            status: 1,
            amount: 10500,
            payment: {
              status: 2,
              flowOrder: 777,
              paymentData: { amount: 10500, fee: 335 },
            },
          },
        ],
      };

      const settled = await svc.reconcileSubscription(sub, fs as never);
      expect(settled).toBe(1);

      const p = fx.payments.get("pay-9")!;
      expect(p.status).toBe("PAID");
      expect(p.gatewayFeeClp).toBe(335);
      // el retry materializó el enrollment pendiente
      expect(fx.enrollments).toHaveLength(1);
      expect(fx.enrollments[0]).toMatchObject({
        academyId: "ac1",
        personId: "p1",
        status: "ACTIVE",
      });
      // ORDER_CREATED ya se emitió en la pasada original — el retry solo
      // agrega la transición del settle (idempotente, no duplica eventos)
      const types = fx.events
        .filter((e) => e.paymentId === "pay-9")
        .map((e) => e.type);
      expect(types).toEqual(["STATUS_CONFIRMED", "RENEWAL_SETTLED"]);
      // la invoice queda marcada solo porque el settle no lanzó
      const row = fx.subs.find((s) => s.id === sub.id)!;
      expect(row.lastInvoiceId).toBe("42");
    });

    it("dedup: invoice ya en lastInvoiceId o con Payment existente → no duplica", async () => {
      const sub = mkSub({ status: "ACTIVE", flowSubscriptionId: "fsub-1" });
      fx.subs.push(sub);
      const fs = {
        subscriptionId: "fsub-1",
        planId: "omni_plan1",
        status: 1,
        invoices: [{ id: 42, status: 1, amount: 10500 }],
      };
      expect(await svc.reconcileSubscription(sub, fs as never)).toBe(1);
      // segunda pasada: lastInvoiceId dedup
      expect(await svc.reconcileSubscription(sub, fs as never)).toBe(0);
      expect(fx.payments.size).toBe(1);
      // tercera pasada con lastInvoiceId pisado: dedup por refId existente
      const row = fx.subs.find((s) => s.id === sub.id)!;
      row.lastInvoiceId = null;
      const fresh = { ...sub, lastInvoiceId: null } as MembershipSubscription;
      expect(await svc.reconcileSubscription(fresh, fs as never)).toBe(0);
      expect(fx.payments.size).toBe(1);
      // y la marca se repone
      expect(row.lastInvoiceId).toBe("42");
    });

    it("cancel_at_period_end remoto → CANCEL_PENDING local", async () => {
      const sub = mkSub({ status: "ACTIVE", flowSubscriptionId: "fsub-1" });
      fx.subs.push(sub);
      await svc.reconcileSubscription(sub, {
        subscriptionId: "fsub-1",
        planId: "omni_plan1",
        status: 1,
        cancel_at_period_end: 1,
        next_invoice_date: "2026-10-24",
        invoices: [],
      } as never);
      const row = fx.subs.find((s) => s.id === sub.id)!;
      expect(row.status).toBe("CANCEL_PENDING");
      expect(row.canceledAt).toBeInstanceOf(Date);
    });
  });

  describe("reconcileAll", () => {
    it("itera subs vivas con flowSubscriptionId y reconcilia", async () => {
      fx.subs.push(
        mkSub({ status: "ACTIVE", flowSubscriptionId: "fsub-1" }),
        mkSub({ status: "CANCEL_PENDING", flowSubscriptionId: "fsub-2" }),
        mkSub({ status: "PENDING_CARD" }), // sin flowSub → no se consulta
        mkSub({ status: "CANCELED", flowSubscriptionId: "fsub-3" }),
      );
      flow.getSubscription.mockImplementation(async (id: string) => ({
        subscriptionId: id,
        planId: "omni_plan1",
        status: 1,
        next_invoice_date: "2026-10-24",
        invoices: [],
      }));
      const r = await svc.reconcileAll();
      expect(r).toEqual({ checked: 2, settled: 0 });
      expect(flow.getSubscription).toHaveBeenCalledTimes(2);
    });
  });

  describe("subscriptionWebhook", () => {
    it("registra INBOUND y dispara reconcileAll sin await", async () => {
      fx.subs.push(mkSub({ status: "ACTIVE", flowSubscriptionId: "fsub-1" }));
      flow.getSubscription.mockResolvedValue({
        subscriptionId: "fsub-1",
        planId: "omni_plan1",
        status: 1,
        invoices: [],
      });
      await svc.subscriptionWebhook("tok-wh");
      expect(fx.gatewayTxs[0]).toMatchObject({
        direction: "INBOUND_WEBHOOK",
        endpoint: "subscription/callback",
        requestBody: { token: "tok-wh" },
        ok: true,
      });
      // fire-and-forget: el reconcile corre en background — esperar el tick
      await new Promise((r) => setTimeout(r, 10));
      expect(flow.getSubscription).toHaveBeenCalled();
    });

    it("sin token → registra INBOUND pero NO dispara reconcileAll (I3)", async () => {
      // Endpoint público: un POST arbitrario sin token no puede forzar
      // N llamadas firmadas a Flow (amplificación). El INBOUND queda
      // registrado igual — evidencia del intento.
      fx.subs.push(mkSub({ status: "ACTIVE", flowSubscriptionId: "fsub-1" }));
      await svc.subscriptionWebhook(null);
      expect(fx.gatewayTxs[0]).toMatchObject({
        direction: "INBOUND_WEBHOOK",
        endpoint: "subscription/callback",
        requestBody: { token: null },
        ok: true,
      });
      await new Promise((r) => setTimeout(r, 10));
      expect(flow.getSubscription).not.toHaveBeenCalled();
    });

    it("token vacío → INBOUND registrado, sin reconcile", async () => {
      await svc.subscriptionWebhook("");
      expect(fx.gatewayTxs).toHaveLength(1);
      await new Promise((r) => setTimeout(r, 10));
      expect(flow.getSubscription).not.toHaveBeenCalled();
    });
  });
});
