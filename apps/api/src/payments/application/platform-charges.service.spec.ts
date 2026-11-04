import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  BadGatewayException,
  ForbiddenException,
  NotFoundException,
  type ExecutionContext,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { PrismaService } from "../../prisma.service";
import type { ParamsService } from "../../params/params.service";
import type { NotificationsService } from "../../notifications/domain/notifications.service";
import type { CollectResult, PaymentGateway } from "../domain/ports";
import { GatewayRegistry } from "../domain/gateway-registry";
import { PaymentSettlementService } from "./payment-settlement.service";
import { PlatformChargesService } from "./platform-charges.service";
import { RolesGuard } from "../../common/rbac/roles.guard";
// Ciclo session.guard ⇄ auth.controller (ver payouts.controller.spec.ts).
import "../../auth/infrastructure/auth.controller";
import { AdminPlatformChargesController } from "../../admin/infrastructure/platform-charges.controller";

// PlatformChargesService (spec payments/platform-charges): cobro suelto
// plataforma→actor sobre el medio de pago del subscription_gateway.
// Fake SubscriptionProvider + prisma stateful (mismo patrón que
// platform-subscriptions.service.spec) y PaymentSettlementService REAL:
// el spec ejerce el camino completo Payment → settle → gateway* →
// PaymentEvent → aviso al pagador.

type Row = Record<string, unknown>;
type Opts = { correlationId?: string } | undefined;

function matchWhere(row: Row, where: Row): boolean {
  for (const [k, cond] of Object.entries(where)) {
    const v = row[k];
    if (cond != null && typeof cond === "object" && !Array.isArray(cond)) {
      const c = cond as Row;
      if ("not" in c) {
        if (c.not === null ? v === null : v === c.not) return false;
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
  const persons = new Map<string, Row>();
  const personRoles: Row[] = [];
  let seq = 0;
  const nid = () => `id-${++seq}`;

  const prisma = {
    person: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        const p = persons.get(where.id);
        return p ? { ...p } : null;
      }),
      findUniqueOrThrow: vi.fn(
        async ({ where }: { where: { id: string } }) => {
          const p = persons.get(where.id);
          if (!p) throw new Error("P2025");
          return { ...p };
        },
      ),
      update: vi.fn(
        async ({ where, data }: { where: { id: string }; data: Row }) => {
          const p = persons.get(where.id);
          if (p) Object.assign(p, data);
          return p;
        },
      ),
    },
    personRole: {
      findMany: vi.fn(async ({ where }: { where?: Row } = {}) =>
        personRoles.filter((r) => !where || matchWhere(r, where)),
      ),
    },
    payment: {
      create: vi.fn(async ({ data }: { data: Row }) => {
        const row: Row = {
          id: nid(),
          status: "PENDING",
          createdAt: new Date(),
          gatewayRef: null,
          ...data,
        };
        payments.set(row.id as string, row);
        return row;
      }),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        const p = payments.get(where.id);
        return p ? { ...p } : null;
      }),
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
      delete: vi.fn(async ({ where }: { where: { id: string } }) => {
        payments.delete(where.id);
        return {};
      }),
    },
    paymentEvent: {
      findFirst: vi.fn(
        async ({ where }: { where: Row; orderBy?: Row }) =>
          events
            .filter((e) => matchWhere(e, where))
            .sort((a, b) => (b.seq as number) - (a.seq as number))[0] ??
          null,
      ),
      create: vi.fn(async ({ data }: { data: Row }) => {
        const stored = JSON.parse(JSON.stringify(data)) as Row;
        events.push(stored);
        return stored;
      }),
      deleteMany: vi.fn(
        async ({ where }: { where: { paymentId: string } }) => {
          const before = events.length;
          for (let i = events.length - 1; i >= 0; i--) {
            if (events[i].paymentId === where.paymentId)
              events.splice(i, 1);
          }
          return { count: before - events.length };
        },
      ),
    },
    event: {
      findUnique: vi.fn(async () => null),
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn(prisma),
    $executeRaw: vi.fn(async () => 0),
  };
  return { prisma, payments, events, persons, personRoles };
}

function mkProvider() {
  return {
    name: "FLOW",
    currencies: ["CLP"],
    createOrder: vi.fn(),
    verifyWebhook: vi.fn(),
    ensurePlan: vi.fn(async () => undefined),
    syncPlan: vi.fn(async () => undefined),
    createCustomer: vi.fn(
      async (p: { email: string; name: string; externalId: string }) => ({
        customerId: `cus_${p.externalId}`,
      }),
    ),
    getCustomer: vi.fn(async () => ({ hasCard: true })),
    registerCustomerCard: vi.fn(async () => ({ registerUrl: "x" })),
    getRegisterStatus: vi.fn(async () => ({ registered: true })),
    createSubscription: vi.fn(),
    getSubscription: vi.fn(),
    cancelSubscription: vi.fn(async () => undefined),
    collect: vi.fn(
      async (
        p: { customerId: string; amount: number; commerceOrder: string },
        _opts?: Opts,
      ): Promise<CollectResult> => ({
        outcome: "COLLECTED" as const,
        flowOrder: "fo-1",
        gatewayData: {
          amount: p.amount,
          fee: 0,
          media: "VISA",
          transferDate: "2026-11-03",
          currency: "CLP",
        },
      }),
    ),
  };
}

function mkNotifications() {
  return {
    notifySafe: vi.fn(async (_personId: string, _input: Row) => undefined),
  };
}

const CHARGE = {
  personId: "p1",
  amount: 50000,
  subject: "Deuda evento octubre",
  actor: "admin",
  adminId: "adm-1",
};

describe("PlatformChargesService", () => {
  let fx: ReturnType<typeof mkPrisma>;
  let provider: ReturnType<typeof mkProvider>;
  let notifications: ReturnType<typeof mkNotifications>;
  let svc: PlatformChargesService;

  beforeEach(() => {
    fx = mkPrisma();
    provider = mkProvider();
    notifications = mkNotifications();
    fx.persons.set("p1", {
      id: "p1",
      name: "Owner Uno",
      email: "owner@example.cl",
      gatewayCustomerIds: { FLOW: "cus_p1" },
    });
    const prisma = fx.prisma as unknown as PrismaService;
    const paramsSvc = {
      get: vi.fn(async (_k: string) => null),
      getNumber: vi.fn(async (_k: string, fb: number) => fb),
    } as unknown as ParamsService;
    const notif = notifications as unknown as NotificationsService;
    svc = new PlatformChargesService(
      prisma,
      paramsSvc,
      new PaymentSettlementService(prisma, paramsSvc, notif, {
        send: vi.fn(async () => undefined),
      }),
      new GatewayRegistry([provider as unknown as PaymentGateway], "FLOW"),
    );
  });

  it("COLLECTED → Payment PAID con gateway* + ledger completo", async () => {
    const r = await svc.collect(CHARGE);
    expect(r.outcome).toBe("COLLECTED");
    const payment = [...fx.payments.values()][0];
    expect(payment.id).toBe(r.paymentId);
    expect(payment.status).toBe("PAID");
    expect(payment.orderType).toBe("PLATFORM_CHARGE");
    expect(payment.refId).toMatch(/^platchg_[0-9a-f-]{36}$/);
    expect(payment.fee).toBe(0);
    expect(payment.net).toBe(50000);
    expect(payment.gateway).toBe("FLOW");
    expect(payment.gatewayRef).toBe("fo-1");
    expect(payment.gatewayMedia).toBe("VISA");
    const types = fx.events.map((e) => e.type);
    expect(types).toEqual([
      "ORDER_CREATED",
      "STATUS_CONFIRMED",
      "SETTLED",
    ]);
    // El cargo salió al collect del provider con el refId como
    // commerceOrder y el concepto del admin.
    expect(provider.collect).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: "cus_p1",
        amount: 50000,
        subject: "Deuda evento octubre",
        commerceOrder: payment.refId,
      }),
      expect.anything(),
    );
    // Aviso al pagador con el concepto.
    expect(notifications.notifySafe).toHaveBeenCalledWith(
      "p1",
      expect.objectContaining({ type: "payment.paid" }),
    );
  });

  it("FAILED → Payment FAILED + evento FAILED + aviso payment.failed", async () => {
    provider.collect.mockResolvedValueOnce({
      outcome: "FAILED" as const,
      flowOrder: "fo-9",
    });
    const r = await svc.collect(CHARGE);
    expect(r.outcome).toBe("FAILED");
    const payment = [...fx.payments.values()][0];
    expect(payment.status).toBe("FAILED");
    const types = fx.events.map((e) => e.type);
    expect(types).toEqual(["ORDER_CREATED", "STATUS_CONFIRMED", "FAILED"]);
    expect(notifications.notifySafe).toHaveBeenCalledWith(
      "p1",
      expect.objectContaining({ type: "payment.failed" }),
    );
  });

  it("PENDING → Payment queda PENDING y devuelve paymentUrl", async () => {
    provider.collect.mockResolvedValueOnce({
      outcome: "PENDING" as const,
      flowOrder: "fo-7",
      paymentUrl: "https://flow.example/pay/t1",
    });
    const r = await svc.collect(CHARGE);
    expect(r.outcome).toBe("PENDING");
    expect(r.paymentUrl).toBe("https://flow.example/pay/t1");
    const payment = [...fx.payments.values()][0];
    expect(payment.status).toBe("PENDING");
    expect(payment.gatewayRef).toBe("fo-7");
    // El link dejado PENDING se liquida después por la rama de settle
    // (webhook/polling): al PAID quedan los gateway* y el SETTLED.
    const settlement = new PaymentSettlementService(
      fx.prisma as unknown as PrismaService,
      { getNumber: async (_k: string, fb: number) => fb } as never,
      notifications as unknown as NotificationsService,
      { send: vi.fn(async () => undefined) },
    );
    const current = { ...(payment as object), gatewayRef: "fo-7" };
    await settlement.settle(current as never, "PAID", {
      actor: "webhook",
    });
    expect(payment.status).toBe("PAID");
    expect(fx.events.map((e) => e.type)).toContain("SETTLED");
  });

  it("error transitorio del proveedor → libera el claim y responde 502", async () => {
    provider.collect.mockRejectedValueOnce(new Error("ECONNRESET"));
    await expect(svc.collect(CHARGE)).rejects.toThrow(BadGatewayException);
    // El claim se libera completo: ni Payment ni eventos quedan.
    expect(fx.payments.size).toBe(0);
    expect(fx.events).toHaveLength(0);
  });

  it("persona inexistente → 404 sin tocar la pasarela", async () => {
    await expect(
      svc.collect({ ...CHARGE, personId: "ghost" }),
    ).rejects.toThrow(NotFoundException);
    expect(provider.collect).not.toHaveBeenCalled();
    expect(fx.payments.size).toBe(0);
  });
});

describe("AdminPlatformChargesController (guard)", () => {
  const reflector = new Reflector();
  // Catálogo con keys únicas por el cache estático del guard.
  const roleCatalog = [
    {
      key: "R_PLATCHG_ADMIN",
      isSuperuser: false,
      permissions: ["admin.access"],
    },
    { key: "R_PLATCHG_STAFF", isSuperuser: false, permissions: [] },
  ];
  const prisma = {
    role: {
      findMany: async (args: { where: { key: { in: string[] } } }) =>
        roleCatalog
          .filter((r) => args.where.key.in.includes(r.key))
          .map((r) => ({
            key: r.key,
            isSuperuser: r.isSuperuser,
            permissions: r.permissions.map((permissionKey) => ({
              permissionKey,
            })),
          })),
    },
  } as unknown as PrismaService;
  const guard = new RolesGuard(reflector, prisma);

  function ctx(person?: {
    roleStates: { role: string; status: string }[];
  }): ExecutionContext {
    return {
      switchToHttp: () => ({ getRequest: () => ({ person }) }),
      getHandler: () => AdminPlatformChargesController.prototype.create,
      getClass: () => AdminPlatformChargesController,
    } as unknown as ExecutionContext;
  }

  it("sin permiso admin.access → 403 sin crear Payment ni llamar al servicio", async () => {
    const charges = { collect: vi.fn() };
    const ctrl = new AdminPlatformChargesController(charges as never);
    expect(ctrl).toBeDefined();
    const staff = {
      roleStates: [{ role: "R_PLATCHG_STAFF", status: "APPROVED" }],
    };
    await expect(guard.canActivate(ctx(staff))).rejects.toThrow(
      ForbiddenException,
    );
    expect(charges.collect).not.toHaveBeenCalled();
  });

  it("con admin.access → permite y delega con actor admin + adminId", async () => {
    const admin = {
      roleStates: [{ role: "R_PLATCHG_ADMIN", status: "APPROVED" }],
    };
    await expect(guard.canActivate(ctx(admin))).resolves.toBe(true);

    const charges = { collect: vi.fn(async (input: Row) => input) };
    const ctrl = new AdminPlatformChargesController(charges as never);
    const req = { person: { id: "adm-1" } };
    await ctrl.create(
      { personId: "p1", amount: 50000, subject: "Deuda" },
      req as never,
    );
    expect(charges.collect).toHaveBeenCalledWith(
      expect.objectContaining({
        personId: "p1",
        amount: 50000,
        subject: "Deuda",
        actor: "admin",
        adminId: "adm-1",
      }),
    );
  });
});
