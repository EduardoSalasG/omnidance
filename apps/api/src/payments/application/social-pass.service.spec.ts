import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  BadRequestException,
  NotFoundException,
} from "@nestjs/common";
import type { PrismaService } from "../../prisma.service";
import type { ParamsService } from "../../params/params.service";
import type { FeatureFlagsService } from "../../features/feature-flags.service";
import { GatewayRegistry } from "../domain/gateway-registry";
import type { PaymentGateway, SubscriptionProvider } from "../domain/ports";
import {
  isPassActive,
  SocialPassConflictError,
  SocialPassService,
  SocialPassUnavailableError,
} from "./social-pass.service";

// SocialPassService (spec pase-social): flag gating (404 fail-closed),
// precio TierPrice×jurisdicción con fallback CL, subscribe vía Stripe
// explícito (no el param subscription_gateway), cancel_at_period_end,
// y el routing de eventos de billing (invoice.paid → ACTIVE + RESET
// duro; payment_failed → FAILED_CARD; subscription.deleted → CANCELED).

type Row = Record<string, unknown>;

function mkPrisma() {
  const passes: Row[] = [];
  const ledger: Row[] = [];
  const audits: Row[] = [];
  const prisma = {
    person: {
      findUnique: vi.fn(async () => ({
        email: "fan@example.cl",
        name: "Fan",
        jurisdiction: "CL",
      })),
    },
    socialPass: {
      findUnique: vi.fn(
        async ({ where }: { where: Row }) =>
          passes.find(
            (p) =>
              p.personId === where.personId ||
              p.stripeSubId === where.stripeSubId,
          ) ?? null,
      ),
      findFirst: vi.fn(
        async ({ where }: { where: Row }) =>
          passes.find((p) => p.stripeCustomerId === where.stripeCustomerId) ??
          null,
      ),
      upsert: vi.fn(
        async ({ where, create, update }: { where: Row; create: Row; update: Row }) => {
          const i = passes.findIndex((p) => p.personId === where.personId);
          if (i >= 0) {
            passes[i] = { ...passes[i], ...update };
            return passes[i];
          }
          const row = { id: `sp-${passes.length + 1}`, ...create };
          passes.push(row);
          return row;
        },
      ),
      update: vi.fn(async ({ where, data }: { where: Row; data: Row }) => {
        const i = passes.findIndex((p) => p.id === where.id);
        if (i >= 0) passes[i] = { ...passes[i], ...data };
        return passes[i];
      }),
    },
    socialPassLedger: {
      create: vi.fn(async ({ data }: { data: Row }) => {
        ledger.push(data);
        return data;
      }),
    },
    auditLog: {
      create: vi.fn(async ({ data }: { data: Row }) => {
        audits.push(data);
        return data;
      }),
    },
    tierPrice: {
      findFirst: vi.fn(
        async ({ where }: { where: Row }): Promise<Row | null> =>
          where.tierCode === "SOCIAL_PASS" && where.countryCode === "CL"
            ? { price: 15000, currency: "CLP" }
            : null,
      ),
    },
    $transaction: vi.fn(
      async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma),
    ),
  };
  return { prisma, passes, ledger, audits };
}

function mkProvider() {
  const calls: string[] = [];
  const provider = {
    ensurePlan: vi.fn(async () => {
      calls.push("ensurePlan");
    }),
    createCustomer: vi.fn(async () => {
      calls.push("createCustomer");
      return { customerId: "cus_1" };
    }),
    findCustomerByEmail: vi.fn(async () => null),
    registerCustomerCard: vi.fn(async () => {
      calls.push("registerCustomerCard");
      return { registerUrl: "https://checkout.stripe.test/cs_1" };
    }),
    getRegisterStatus: vi.fn(async () => ({
      registered: true,
      customerId: "cus_1",
      subscriptionId: "sub_1",
    })),
    getSubscription: vi.fn(async () => ({
      subscriptionId: "sub_1",
      planId: "SOCIAL_PASS",
      status: "ACTIVE" as const,
      morose: false,
      cancelAtPeriodEnd: false,
      nextInvoiceDate: "2026-12-01T00:00:00.000Z",
    })),
    listCustomerSubscriptions: vi.fn(async () => [
      { subscriptionId: "sub_1", status: "ACTIVE" as const },
    ]),
    createSubscription: vi.fn(async () => ({
      subscriptionId: "sub_1",
      status: "ACTIVE" as const,
    })),
    cancelSubscription: vi.fn(async () => {}),
  };
  // StripeGateway fake: PaymentGateway + SubscriptionProvider.
  const gw = {
    name: "STRIPE",
    createOrder: vi.fn(),
    verifyWebhook: vi.fn(),
    ...provider,
  } as unknown as PaymentGateway & SubscriptionProvider;
  return { gw, provider, calls };
}

const paramsStub = {
  getNumber: vi.fn(async (_k: string, fb: number) => fb),
  get: vi.fn(async () => undefined),
} as unknown as ParamsService;

const flagsOn = { isEnabled: vi.fn(async () => true) };

describe("SocialPassService", () => {
  let fx: ReturnType<typeof mkPrisma>;
  let stripe: ReturnType<typeof mkProvider>;
  let svc: SocialPassService;

  beforeEach(() => {
    fx = mkPrisma();
    stripe = mkProvider();
    svc = new SocialPassService(
      fx.prisma as unknown as PrismaService,
      paramsStub,
      flagsOn as unknown as FeatureFlagsService,
      new GatewayRegistry([stripe.gw], "STUB"),
    );
  });

  it("flag OFF → GET 404 fail-closed", async () => {
    const off = { isEnabled: vi.fn(async () => false) };
    const s = new SocialPassService(
      fx.prisma as unknown as PrismaService,
      paramsStub,
      off as unknown as FeatureFlagsService,
      new GatewayRegistry([stripe.gw], "STUB"),
    );
    await expect(s.getMine("per-1")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("GET sin pass devuelve status null + price por jurisdicción (CL)", async () => {
    const r = await svc.getMine("per-1");
    expect(r.status).toBeNull();
    expect(r.price).toEqual({ amount: 15000, currency: "CLP" });
    expect(r.creditsBalance).toBe(0);
  });

  it("subscribe: customer lazy + ensurePlan + Checkout mode=subscription + fila PENDING", async () => {
    const r = await svc.subscribe("per-1");
    expect(r.registerUrl).toContain("checkout.stripe.test");
    expect(stripe.calls).toEqual([
      "createCustomer",
      "ensurePlan",
      "registerCustomerCard",
    ]);
    const reg = (
      stripe.provider.registerCustomerCard.mock.calls as unknown as unknown[][]
    )[0]![0] as {
      planId: string;
      currency: string;
      metadata: Record<string, string>;
    };
    expect(reg.planId).toBe("SOCIAL_PASS");
    expect(reg.currency).toBe("CLP");
    expect(reg.metadata.personId).toBe("per-1");
    expect(fx.passes[0]).toMatchObject({
      personId: "per-1",
      stripeCustomerId: "cus_1",
      status: "PENDING",
      amount: 15000,
    });
  });

  it("subscribe con pass ACTIVE → 409", async () => {
    fx.passes.push({
      id: "sp-1",
      personId: "per-1",
      stripeCustomerId: "cus_1",
      stripeSubId: "sub_1",
      status: "ACTIVE",
      creditsPerPeriod: 4,
    });
    await expect(svc.subscribe("per-1")).rejects.toBeInstanceOf(
      SocialPassConflictError,
    );
  });

  it("sin adaptador STRIPE registrado → 503", async () => {
    const s = new SocialPassService(
      fx.prisma as unknown as PrismaService,
      paramsStub,
      flagsOn as unknown as FeatureFlagsService,
      new GatewayRegistry([], "STUB"),
    );
    await expect(s.subscribe("per-1")).rejects.toBeInstanceOf(
      SocialPassUnavailableError,
    );
  });

  it("cancel → cancel_at_period_end + CANCEL_PENDING (idempotente)", async () => {
    fx.passes.push({
      id: "sp-1",
      personId: "per-1",
      stripeCustomerId: "cus_1",
      stripeSubId: "sub_1",
      status: "ACTIVE",
      creditsPerPeriod: 4,
      cancelAtPeriodEnd: false,
    });
    const r = await svc.cancel("per-1");
    expect(r.status).toBe("CANCEL_PENDING");
    expect(stripe.provider.cancelSubscription).toHaveBeenCalledWith(
      "sub_1",
      expect.anything(),
    );
    expect(fx.passes[0]!.cancelAtPeriodEnd).toBe(true);
    // Segunda vez: no vuelve a llamar al proveedor.
    await svc.cancel("per-1");
    expect(stripe.provider.cancelSubscription).toHaveBeenCalledTimes(1);
    expect(fx.audits[0]!.action).toBe("SOCIAL_PASS_CANCEL_REQUESTED");
  });

  it("cancel sin pass → 404; pass PENDING → 400", async () => {
    await expect(svc.cancel("per-1")).rejects.toBeInstanceOf(NotFoundException);
    fx.passes.push({ id: "sp-1", personId: "per-1", status: "PENDING" });
    await expect(svc.cancel("per-1")).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("invoice.paid → ACTIVE + RESET duro (balance = allotment, no suma)", async () => {
    fx.passes.push({
      id: "sp-1",
      personId: "per-1",
      stripeCustomerId: "cus_1",
      stripeSubId: "sub_1",
      status: "ACTIVE",
      creditsBalance: 2, // remanente del período anterior - se pierde
      creditsPerPeriod: 4,
      currentPeriodEnd: new Date("2026-11-01T00:00:00Z"),
      cancelAtPeriodEnd: false,
    });
    await svc.handleBillingEvent({
      type: "invoice.paid",
      customerId: "cus_1",
      subscriptionId: "sub_1",
      invoice: {
        id: "in_1",
        amount: 15000,
        currency: "CLP",
        periodEnd: "2026-12-01T00:00:00.000Z",
        paid: true,
      },
    });
    expect(fx.passes[0]).toMatchObject({
      status: "ACTIVE",
      creditsBalance: 4, // reset duro, no 6
    });
    expect(fx.ledger[0]).toMatchObject({ delta: 4, reason: "RESET" });
    expect(fx.audits[0]!.action).toBe("SOCIAL_PASS_RENEWED");
  });

  it("invoice.paid duplicado del mismo período → no duplica RESET", async () => {
    const end = new Date("2026-12-01T00:00:00Z");
    fx.passes.push({
      id: "sp-1",
      personId: "per-1",
      stripeSubId: "sub_1",
      status: "ACTIVE",
      creditsBalance: 4,
      creditsPerPeriod: 4,
      currentPeriodEnd: end,
    });
    await svc.handleBillingEvent({
      type: "invoice.paid",
      subscriptionId: "sub_1",
      invoice: {
        id: "in_1",
        amount: 15000,
        currency: "CLP",
        periodEnd: end.toISOString(),
        paid: true,
      },
    });
    expect(fx.ledger).toHaveLength(0);
  });

  it("invoice.payment_failed → FAILED_CARD; subscription.deleted → CANCELED", async () => {
    fx.passes.push({
      id: "sp-1",
      personId: "per-1",
      stripeSubId: "sub_1",
      status: "ACTIVE",
      creditsPerPeriod: 4,
    });
    await svc.handleBillingEvent({
      type: "invoice.payment_failed",
      subscriptionId: "sub_1",
      invoice: { id: "in_2", amount: 15000, currency: "CLP", paid: false },
    });
    expect(fx.passes[0]!.status).toBe("FAILED_CARD");
    await svc.handleBillingEvent({
      type: "customer.subscription.deleted",
      subscriptionId: "sub_1",
      customerId: "cus_1",
    });
    expect(fx.passes[0]!.status).toBe("CANCELED");
  });

  it("confirm por polling activa el pass PENDING sin webhook (dev)", async () => {
    fx.passes.push({
      id: "sp-1",
      personId: "per-1",
      stripeCustomerId: "cus_1",
      stripeSubId: "pending:per-1",
      status: "PENDING",
      creditsPerPeriod: 4,
      cancelAtPeriodEnd: false,
    });
    const r = await svc.confirm("per-1", "cs_1");
    expect(r.activated).toBe(true);
    expect(fx.passes[0]).toMatchObject({
      status: "ACTIVE",
      stripeSubId: "sub_1",
      creditsBalance: 4,
    });
    expect(fx.audits[0]!.action).toBe("SOCIAL_PASS_ACTIVATED");
  });

  it("isPassActive: ACTIVE y CANCEL_PENDING dan acceso; el resto no", () => {
    expect(isPassActive({ status: "ACTIVE" } as never)).toBe(true);
    expect(isPassActive({ status: "CANCEL_PENDING" } as never)).toBe(true);
    expect(isPassActive({ status: "FAILED_CARD" } as never)).toBe(false);
    expect(isPassActive(null)).toBe(false);
  });
});
