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
import { StubGateway } from "../infrastructure/stub.gateway";
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
      } else if ("lte" in c) {
        if (
          !(v instanceof Date) ||
          v.getTime() > (c.lte as Date).getTime()
        )
          return false;
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
  // Notificaciones "enviadas" — el spy de notifySafe las registra acá
  // (beforeEach) y notification.findFirst las consulta: así el dedup de
  // membership.renewal_failed se ejerce end-to-end en el spec.
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
      // claim atómico del settle (updateMany id + status/{not}).
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
    // PlatformSubscription (saas-billing): el orphan sweep de subs cubre
    // ambas tablas — sin filas acá, siempre vacío.
    platformSubscription: {
      findMany: vi.fn(async () => [] as Row[]),
      updateMany: vi.fn(async () => ({ count: 0 })),
    },
    notification: {
      // Dedup de renewal_failed: filtra por personId/type y, si viene,
      // por data.path + equals (filtro JSON de Prisma sobre Postgres).
      findFirst: vi.fn(async ({ where }: { where: Row }) => {
        const d = where.data as
          | { path?: string[]; equals?: unknown }
          | undefined;
        return (
          sentNotifs.find((n) => {
            if (n.personId !== where.personId) return false;
            if (n.type !== where.type) return false;
            if (d?.path) {
              let cur: unknown = n.data;
              for (const key of d.path) {
                cur = (cur as Row | null | undefined)?.[key];
              }
              if (cur !== d.equals) return false;
            }
            return true;
          }) ?? null
        );
      }),
    },
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
    enrollments,
    subs,
    persons,
    plans,
    gatewayTxs,
    sentNotifs,
  };
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
  return {
    notifySafe: vi.fn(async (_personId: string, _input: Row) => undefined),
  };
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
    // El dedup de mora consulta prisma.notification — el spy registra
    // cada notifySafe en sentNotifs para que findFirst lo encuentre.
    notifications.notifySafe.mockImplementation(
      async (personId: string, input: Row) => {
        fx.sentNotifs.push({ personId, ...input });
      },
    );
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
        "no soporta suscripciones",
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

      // plan espejo lazy: ensurePlan con el precio del plan (SIN fee —
      // modelo SaaS) e interval mensual
      expect(flow.ensurePlan).toHaveBeenCalledWith(
        {
          planId: "omni_plan1",
          name: "Academia X — Mensual",
          amount: 10000,
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
      // Persistencia temprana: el id remoto se escribe en su propia
      // escritura justo tras createSubscription — aunque la transición
      // de estado falle, el sweep de huérfanas puede rastrearla.
      expect(fx.subs[0]!.flowSubscriptionId).toBe("fsub-1");
    });

    it("ACTIVATING expirada que commiteó ACTIVE entremedio → 409, NO se pisa ni crea fila", async () => {
      // El request colgado termina entre el findMany y el cancel de la
      // tx: el updateMany condicional {id, status:"ACTIVATING"} devuelve
      // count 0 → abortar. Un update incondicional pisaría ACTIVE→
      // CANCELED y dejaría la sub Flow viva cobrando sin reflejo local.
      const stale = mkSub({
        status: "ACTIVATING",
        createdAt: new Date(Date.now() - 20 * 60_000),
      });
      fx.subs.push(stale);
      const inner = fx.prisma.membershipSubscription as unknown as {
        updateMany: (a: { where: Row; data: Row }) => Promise<{ count: number }>;
      };
      const orig = inner.updateMany;
      inner.updateMany = vi.fn(
        async ({ where, data }: { where: Row; data: Row }) => {
          if (where.id === stale.id && where.status === "ACTIVATING") {
            stale.status = "ACTIVE"; // el request colgado commiteó
            return { count: 0 };
          }
          return orig({ where, data });
        },
      );

      await expect(svc.subscribe("p1", "plan1", true)).rejects.toThrow(
        ConflictException,
      );
      expect(stale.status).toBe("ACTIVE"); // no se pisó
      expect(fx.subs).toHaveLength(1); // no se creó intento nuevo
      expect(flow.createSubscription).not.toHaveBeenCalled();
    });

    it("PENDING_CARD expirada claimeada por customer-return entremedio → 409, sin fila nueva", async () => {
      // El sweep M7 es dirigido por (id, status esperado): si el return
      // del browser claimeó la pendiente entre el findMany y el update,
      // count===0 → abortar (si no, quedarían dos filas activables).
      const stale = mkSub({
        status: "PENDING_CARD",
        createdAt: new Date(Date.now() - 20 * 60_000),
      });
      fx.subs.push(stale);
      const inner = fx.prisma.membershipSubscription as unknown as {
        updateMany: (a: { where: Row; data: Row }) => Promise<{ count: number }>;
      };
      const orig = inner.updateMany;
      inner.updateMany = vi.fn(
        async ({ where, data }: { where: Row; data: Row }) => {
          if (where.id === stale.id && where.status === "PENDING_CARD") {
            stale.status = "ACTIVATING"; // customer-return la claimeó
            return { count: 0 };
          }
          return orig({ where, data });
        },
      );

      await expect(svc.subscribe("p1", "plan1", true)).rejects.toThrow(
        ConflictException,
      );
      expect(stale.status).toBe("ACTIVATING"); // no se pisó
      expect(fx.subs).toHaveLength(1);
      expect(flow.createSubscription).not.toHaveBeenCalled();
    });

    it("claim perdido y la sub quedó CANCELED → 409 con mensaje de cancelada (N3)", async () => {
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
            pending.status = "CANCELED"; // cancel/sweep concurrente
            return { count: 0 };
          }
          return orig({ where, data });
        },
      );

      await expect(svc.subscribe("p1", "plan1", true)).rejects.toThrow(
        "cancelada",
      );
      expect(flow.createSubscription).not.toHaveBeenCalled();
    });

    it("createSubscription devuelve status como STRING '4' → CANCELED (coerción M4)", async () => {
      flow.getCustomer.mockResolvedValue({ creditCardType: "Visa" });
      flow.createSubscription.mockResolvedValue({
        subscriptionId: "fsub-s",
        planId: "omni_plan1",
        status: "4" as unknown as number, // Flow a veces manda string
        next_invoice_date: "2026-10-24",
        invoices: [],
      });
      const r = await svc.subscribe("p1", "plan1", true);
      expect(r.kind).toBe("subscribed");
      const sub = fx.subs[0]!;
      expect(sub.status).toBe("CANCELED");
      expect(sub.flowSubscriptionId).toBe("fsub-s");
      expect(notifications.notifySafe).not.toHaveBeenCalled();
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

    it("cancel_at_period_end como STRING '1' → CANCEL_PENDING (coerción)", async () => {
      const sub = mkSub({ status: "ACTIVE", flowSubscriptionId: "fsub-1" });
      fx.subs.push(sub);
      await svc.reconcileSubscription(sub, {
        subscriptionId: "fsub-1",
        planId: "omni_plan1",
        status: 1,
        cancel_at_period_end: "1" as unknown as number,
        next_invoice_date: "2026-10-24",
        invoices: [],
      } as never);
      expect(fx.subs.find((s) => s.id === sub.id)!.status).toBe(
        "CANCEL_PENDING",
      );
    });

    it("nextInvoiceAt dentro de 24h → reminder renewal_reminder + reminderSentFor", async () => {
      const in12h = new Date(Date.now() + 12 * 60 * 60_000);
      const sub = mkSub({ status: "ACTIVE", flowSubscriptionId: "fsub-1" });
      fx.subs.push(sub);
      await svc.reconcileSubscription(sub, {
        subscriptionId: "fsub-1",
        planId: "omni_plan1",
        status: 1,
        next_invoice_date: in12h.toISOString(),
        invoices: [],
      } as never);
      expect(notifications.notifySafe).toHaveBeenCalledWith(
        "p1",
        expect.objectContaining({
          category: "TRANSACTIONAL",
          type: "membership.renewal_reminder",
          data: expect.objectContaining({
            subscriptionId: sub.id,
            planId: "plan1",
            planName: "Mensual",
          }),
        }),
      );
      const row = fx.subs.find((s) => s.id === sub.id)!;
      expect(row.reminderSentFor).toEqual(in12h);
      expect(row.nextInvoiceAt).toEqual(in12h);
    });

    it("reminder dedup: reminderSentFor === nextInvoiceAt → no re-notifica; fecha nueva → re-notifica", async () => {
      const in12h = new Date(Date.now() + 12 * 60 * 60_000);
      const sub = mkSub({
        status: "ACTIVE",
        flowSubscriptionId: "fsub-1",
        nextInvoiceAt: in12h,
        reminderSentFor: in12h, // ya avisado para esta fecha
      });
      fx.subs.push(sub);
      const fs = {
        subscriptionId: "fsub-1",
        planId: "omni_plan1",
        status: 1,
        next_invoice_date: in12h.toISOString(),
        invoices: [],
      };
      await svc.reconcileSubscription(sub, fs as never);
      expect(notifications.notifySafe).not.toHaveBeenCalled();

      // Flow movió el cobro → nueva fecha → se puede volver a avisar
      const in20h = new Date(Date.now() + 20 * 60 * 60_000);
      const sub2 = {
        ...sub,
        nextInvoiceAt: in12h,
        reminderSentFor: in12h,
      } as MembershipSubscription;
      await svc.reconcileSubscription(sub2, {
        ...fs,
        next_invoice_date: in20h.toISOString(),
      } as never);
      expect(notifications.notifySafe).toHaveBeenCalledTimes(1);
      expect(
        fx.subs.find((s) => s.id === sub.id)!.reminderSentFor,
      ).toEqual(in20h);
    });

    it("nextInvoiceAt fuera de ventana (>24h o pasado) → sin reminder", async () => {
      const sub = mkSub({ status: "ACTIVE", flowSubscriptionId: "fsub-1" });
      fx.subs.push(sub);
      const base = {
        subscriptionId: "fsub-1",
        planId: "omni_plan1",
        status: 1,
        invoices: [],
      };
      // próximo cobro en 7 días → fuera de la ventana de 24h
      await svc.reconcileSubscription(sub, {
        ...base,
        next_invoice_date: new Date(
          Date.now() + 7 * 24 * 60 * 60_000,
        ).toISOString(),
      } as never);
      // cobro ya pasado → nunca se recuerda atrasado
      await svc.reconcileSubscription(sub, {
        ...base,
        next_invoice_date: new Date(Date.now() - 60_000).toISOString(),
      } as never);
      expect(notifications.notifySafe).not.toHaveBeenCalled();
      expect(
        fx.subs.find((s) => s.id === sub.id)!.reminderSentFor,
      ).toBeNull();
    });

    it("cancel_at_period_end con cobro <24h → CANCEL_PENDING y SIN reminder", async () => {
      // Una sub cancelada al fin de período no tiene próximo cobro real
      // aunque Flow siga reportando next_invoice_date.
      const sub = mkSub({ status: "ACTIVE", flowSubscriptionId: "fsub-1" });
      fx.subs.push(sub);
      await svc.reconcileSubscription(sub, {
        subscriptionId: "fsub-1",
        planId: "omni_plan1",
        status: 1,
        cancel_at_period_end: 1,
        next_invoice_date: new Date(
          Date.now() + 12 * 60 * 60_000,
        ).toISOString(),
        invoices: [],
      } as never);
      const row = fx.subs.find((s) => s.id === sub.id)!;
      expect(row.status).toBe("CANCEL_PENDING");
      expect(notifications.notifySafe).not.toHaveBeenCalled();
    });

    it("morose=1 con invoice impaga → renewal_failed + enrollment intacto + sub sigue ACTIVE", async () => {
      const sub = mkSub({ status: "ACTIVE", flowSubscriptionId: "fsub-1" });
      fx.subs.push(sub);
      await svc.reconcileSubscription(sub, {
        subscriptionId: "fsub-1",
        planId: "omni_plan1",
        status: 1,
        morose: 1,
        next_invoice_date: "2026-10-24",
        invoices: [{ id: 55, status: 0, amount: 10500 }],
      } as never);
      expect(notifications.notifySafe).toHaveBeenCalledWith(
        "p1",
        expect.objectContaining({
          category: "TRANSACTIONAL",
          type: "membership.renewal_failed",
          data: expect.objectContaining({
            subscriptionId: sub.id,
            invoiceId: "55",
          }),
        }),
      );
      const row = fx.subs.find((s) => s.id === sub.id)!;
      // SIN grace period y sin marcar CANCELED: la sub sigue viva (Flow
      // reintenta), el enrollment no se toca — expira solo en endsAt.
      expect(row.status).toBe("ACTIVE");
      expect(fx.enrollments).toHaveLength(0);
      expect(fx.payments.size).toBe(0);
    });

    it("morose dedup: segunda pasada con la misma invoice impaga → no re-notifica", async () => {
      const sub = mkSub({ status: "ACTIVE", flowSubscriptionId: "fsub-1" });
      fx.subs.push(sub);
      const fs = {
        subscriptionId: "fsub-1",
        planId: "omni_plan1",
        status: 1,
        morose: 1,
        invoices: [{ id: 55, status: 0, amount: 10500 }],
      };
      await svc.reconcileSubscription(sub, fs as never);
      await svc.reconcileSubscription(sub, fs as never);
      const failed = notifications.notifySafe.mock.calls.filter(
        ([, input]) => input.type === "membership.renewal_failed",
      );
      expect(failed).toHaveLength(1);
      // invoice impaga NUEVA (otro intento/episodio) → vuelve a avisar
      await svc.reconcileSubscription(sub, {
        ...fs,
        invoices: [
          { id: 55, status: 0, amount: 10500 },
          { id: 56, status: 0, amount: 10500 },
        ],
      } as never);
      // la clave del episodio es la invoice impaga más antigua (55) —
      // sigue dedupado mientras dure la misma mora
      expect(
        notifications.notifySafe.mock.calls.filter(
          ([, input]) => input.type === "membership.renewal_failed",
        ),
      ).toHaveLength(1);
    });

    it("morose emite RENEWAL_FAILED en el ledger del último pago mem_", async () => {
      const sub = mkSub({ status: "ACTIVE", flowSubscriptionId: "fsub-1" });
      fx.subs.push(sub);
      fx.payments.set("pay-1", {
        id: "pay-1",
        refId: "mem_plan1_42",
        orderType: "MEMBERSHIP",
        personId: "p1",
        status: "PAID",
        createdAt: new Date(),
      });
      await svc.reconcileSubscription(sub, {
        subscriptionId: "fsub-1",
        planId: "omni_plan1",
        status: 1,
        morose: 1,
        invoices: [{ id: 55, status: 0, amount: 10500 }],
      } as never);
      const ev = fx.events.find(
        (e) => e.paymentId === "pay-1" && e.type === "RENEWAL_FAILED",
      );
      expect(ev).toMatchObject({
        actor: "reconcile",
        payload: { subscriptionId: sub.id, invoiceId: "55" },
      });
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

    it("actor 'cron' propaga al ledger; mora detectada en el barrido notifica", async () => {
      fx.subs.push(mkSub({ status: "ACTIVE", flowSubscriptionId: "fsub-1" }));
      fx.payments.set("pay-1", {
        id: "pay-1",
        refId: "mem_plan1_42",
        orderType: "MEMBERSHIP",
        personId: "p1",
        status: "PAID",
        createdAt: new Date(),
      });
      flow.getSubscription.mockResolvedValue({
        subscriptionId: "fsub-1",
        planId: "omni_plan1",
        status: 1,
        morose: 1,
        invoices: [{ id: 55, status: 0, amount: 10500 }],
      });
      const r = await svc.reconcileAll("cron");
      expect(r).toEqual({ checked: 1, settled: 0 });
      expect(notifications.notifySafe).toHaveBeenCalledWith(
        "p1",
        expect.objectContaining({ type: "membership.renewal_failed" }),
      );
      const ev = fx.events.find((e) => e.type === "RENEWAL_FAILED");
      expect(ev?.actor).toBe("cron");
    });

    // ─── Sweep de subs huérfanas (crash entre subscription/create y
    // la persistencia local) ───
    const auditCreate = (subscriptionId: string, over: Row = {}) =>
      fx.gatewayTxs.push({
        provider: "FLOW",
        direction: "OUTBOUND",
        endpoint: "subscription/create",
        ok: true,
        responseBody: { subscriptionId },
        createdAt: new Date(Date.now() - 10 * 60_000), // fuera del grace
        ...over,
      });

    it("create auditado sin fila local + remota activa → cancel inmediata", async () => {
      auditCreate("fsub-huerfana");
      flow.getSubscription.mockResolvedValue({
        subscriptionId: "fsub-huerfana",
        planId: "omni_plan1",
        status: 1,
        invoices: [],
      });
      const r = await svc.reconcileAll();
      expect(r.checked).toBe(0);
      expect(flow.cancelSubscription).toHaveBeenCalledWith("fsub-huerfana", {
        correlationId: expect.any(String),
        immediate: true,
      });
    });

    it("create auditado con sub local ACTIVE → sin cancel (cobertura viva)", async () => {
      fx.subs.push(
        mkSub({ status: "ACTIVE", flowSubscriptionId: "fsub-1" }),
      );
      auditCreate("fsub-1");
      flow.getSubscription.mockResolvedValue({
        subscriptionId: "fsub-1",
        planId: "omni_plan1",
        status: 1,
        invoices: [],
      });
      await svc.reconcileAll();
      expect(flow.cancelSubscription).not.toHaveBeenCalled();
    });

    it("ACTIVATING vieja con flowSubscriptionId + remota activa → cancel remota + local CANCELED", async () => {
      const stale = mkSub({
        status: "ACTIVATING",
        flowSubscriptionId: "fsub-stuck",
        createdAt: new Date(Date.now() - 20 * 60_000),
      });
      fx.subs.push(stale);
      auditCreate("fsub-stuck");
      flow.getSubscription.mockResolvedValue({
        subscriptionId: "fsub-stuck",
        planId: "omni_plan1",
        status: 1,
        invoices: [],
      });
      await svc.reconcileAll();
      expect(flow.cancelSubscription).toHaveBeenCalledWith("fsub-stuck", {
        correlationId: expect.any(String),
        immediate: true,
      });
      const row = fx.subs.find((s) => s.id === stale.id)!;
      expect(row.status).toBe("CANCELED");
      expect(row.canceledAt).toBeInstanceOf(Date);
    });

    it("fila local CANCELED con link + remota activa → cancel inmediata (cancel durante la ventana)", async () => {
      fx.subs.push(
        mkSub({ status: "CANCELED", flowSubscriptionId: "fsub-race" }),
      );
      auditCreate("fsub-race");
      flow.getSubscription.mockResolvedValue({
        subscriptionId: "fsub-race",
        planId: "omni_plan1",
        status: 1,
        invoices: [],
      });
      await svc.reconcileAll();
      expect(flow.cancelSubscription).toHaveBeenCalledWith("fsub-race", {
        correlationId: expect.any(String),
        immediate: true,
      });
    });

    it("idempotente: remota ya cancelada (status 4) → no llama cancel", async () => {
      auditCreate("fsub-dead");
      flow.getSubscription.mockResolvedValue({
        subscriptionId: "fsub-dead",
        planId: "omni_plan1",
        status: 4,
        invoices: [],
      });
      await svc.reconcileAll();
      expect(flow.getSubscription).toHaveBeenCalledWith(
        "fsub-dead",
        expect.anything(),
      );
      expect(flow.cancelSubscription).not.toHaveBeenCalled();
    });

    it("grace period: create auditado muy reciente (en vuelo) → no se toca", async () => {
      auditCreate("fsub-inflight", { createdAt: new Date() });
      await svc.reconcileAll();
      expect(flow.getSubscription).not.toHaveBeenCalled();
      expect(flow.cancelSubscription).not.toHaveBeenCalled();
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

  describe("syncMirrorPlan", () => {
    it("plan con espejo → plans/edit con nombre compuesto y amount = price (SIN fee)", async () => {
      await svc.syncMirrorPlan(
        { flowPlanId: "omni_plan1", academy: { name: "Academia Tumbao" } },
        { name: "Mensual Pro", price: 40000 },
      );

      expect(flow.syncPlan).toHaveBeenCalledWith(
        {
          planId: "omni_plan1",
          name: "Academia Tumbao — Mensual Pro",
          // 40000 — sin service_fee.membership_clp (inerte en el modelo
          // SaaS: el costo Flow se liquida en el payout de la academia).
          amount: 40000,
        },
        expect.objectContaining({ correlationId: expect.any(String) }),
      );
    });

    it("sin flowPlanId → no-op (el espejo se crea en el primer subscribe)", async () => {
      await svc.syncMirrorPlan(
        { flowPlanId: null, academy: { name: "X" } },
        { name: "n", price: 1 },
      );
      expect(flow.syncPlan).not.toHaveBeenCalled();
    });

    it("gateway no-Flow → no-op silencioso", async () => {
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
      await stubSvc.syncMirrorPlan(
        { flowPlanId: "omni_x", academy: { name: "X" } },
        { name: "n", price: 1 },
      );
    });

    it("si Flow rechaza, propaga el error (el caller decide — PATCH aborta)", async () => {
      flow.syncPlan.mockRejectedValueOnce(new Error("flow 500"));
      await expect(
        svc.syncMirrorPlan(
          { flowPlanId: "omni_plan1", academy: { name: "X" } },
          { name: "n", price: 1 },
        ),
      ).rejects.toThrow("flow 500");
    });
  });

  // El StubGateway real como SubscriptionProvider: ejerce el flujo
  // completo de suscripciones en localhost sin credenciales Flow —
  // needs_card → customer-return → ACTIVE → settle del primer invoice.
  describe("StubGateway como SubscriptionProvider", () => {
    let stub: StubGateway;
    let stubSvc: SubscriptionsService;

    beforeEach(() => {
      stub = new StubGateway();
      const params = mkParams();
      const prisma = fx.prisma as unknown as PrismaService;
      const paramsSvc = params as unknown as ParamsService;
      const notif = notifications as unknown as NotificationsService;
      stubSvc = new SubscriptionsService(
        prisma,
        stub as unknown as PaymentGateway,
        paramsSvc,
        new PaymentSettlementService(prisma, paramsSvc, notif),
        notif,
        new GatewayTransactionsService(prisma),
      );
    });

    it("subscribe sin tarjeta → needs_card con registerUrl al callback local", async () => {
      const r = await stubSvc.subscribe("p1", "plan1", true);
      expect(r.kind).toBe("needs_card");
      if (r.kind !== "needs_card") return;
      const url = new URL(r.registerUrl);
      expect(url.pathname).toBe("/api/payments/flow/customer-return");
      expect(url.searchParams.get("token")).toMatch(/^stub_reg_/);
      const sub = fx.subs[0]!;
      expect(sub.status).toBe("PENDING_CARD");
      expect(fx.plans.get("plan1")!.flowPlanId).toBe("omni_plan1");
    });

    it("flujo completo: customer-return con token stub → ACTIVE + invoice inicial liquidado", async () => {
      const r = await stubSvc.subscribe("p1", "plan1", true);
      if (r.kind !== "needs_card") throw new Error("expected needs_card");
      const token = new URL(r.registerUrl).searchParams.get("token")!;

      const back = await stubSvc.customerReturn(token);
      expect(back).toEqual({ ok: true, academyId: "ac1" });

      const sub = fx.subs[0]!;
      expect(sub.status).toBe("ACTIVE");
      expect(sub.flowSubscriptionId).toMatch(/^stub_sub_/);
      expect(sub.nextInvoiceAt).toBeInstanceOf(Date);

      // El invoice inicial (pagado en la simulación) se liquidó: Payment
      // PAID con gateway STUB + enrollment materializado + ledger.
      const payment = [...fx.payments.values()][0]!;
      expect(payment.orderType).toBe("MEMBERSHIP");
      expect(payment.status).toBe("PAID");
      expect(payment.gateway).toBe("STUB");
      // 10000 = precio del plan sin cargo de servicio (modelo SaaS —
      // el plan espejo del stub cobra el mismo amount que ensurePlan).
      expect(payment.amount).toBe(10000);
      expect(fx.enrollments).toHaveLength(1);
      expect(fx.enrollments[0]).toMatchObject({
        academyId: "ac1",
        personId: "p1",
        status: "ACTIVE",
      });
      expect(notifications.notifySafe).toHaveBeenCalledWith(
        "p1",
        expect.objectContaining({ type: "membership.subscription_started" }),
      );
    });

    it("customer con tarjeta ya registrada → subscribed directo", async () => {
      // Armar el customer en el stub: createCustomer + register +
      // getRegisterStatus (lo que haría el browser al volver de Flow).
      const c = await stub.createCustomer({
        email: "fan@example.cl",
        name: "Fan Uno",
        externalId: "p1",
      });
      const { registerUrl } = await stub.registerCustomerCard({
        customerId: c.customerId,
        returnUrl: "http://localhost/cb",
      });
      await stub.getRegisterStatus(
        new URL(registerUrl).searchParams.get("token")!,
      );
      fx.persons.get("p1")!.flowCustomerId = c.customerId;

      const r = await stubSvc.subscribe("p1", "plan1", true);
      expect(r.kind).toBe("subscribed");
      expect(fx.subs[0]!.status).toBe("ACTIVE");
    });

    it("cancel → CANCEL_PENDING y el remoto queda cancel_at_period_end", async () => {
      const c = await stub.createCustomer({
        email: "fan@example.cl",
        name: "Fan Uno",
        externalId: "p1",
      });
      const { registerUrl } = await stub.registerCustomerCard({
        customerId: c.customerId,
        returnUrl: "http://localhost/cb",
      });
      await stub.getRegisterStatus(
        new URL(registerUrl).searchParams.get("token")!,
      );
      fx.persons.get("p1")!.flowCustomerId = c.customerId;
      const r = await stubSvc.subscribe("p1", "plan1", true);
      if (r.kind !== "subscribed") throw new Error("expected subscribed");

      const res = await stubSvc.cancel("p1", r.subscriptionId);
      expect(res.status).toBe("CANCEL_PENDING");
      const remote = await stub.getSubscription(
        fx.subs[0]!.flowSubscriptionId as string,
      );
      expect(Number(remote.cancel_at_period_end)).toBe(1);
      expect(Number(remote.status)).toBe(1);
    });

    it("reconcileAll con stub: sub remota perdida (restart) → local converge a CANCELED", async () => {
      fx.subs.push(
        mkSub({ status: "ACTIVE", flowSubscriptionId: "stub_sub_gone" }),
      );
      const r = await stubSvc.reconcileAll();
      expect(r.checked).toBe(1);
      expect(fx.subs[0]!.status).toBe("CANCELED");
    });
  });
});
