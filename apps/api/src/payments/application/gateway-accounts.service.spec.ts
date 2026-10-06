import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { GatewayAccountsService } from "./gateway-accounts.service";
import { FlowGateway } from "../infrastructure/flow.gateway";
import { MercadoPagoGateway } from "../infrastructure/mercadopago.gateway";
import { StubGateway } from "../infrastructure/stub.gateway";
import { decryptSecret } from "../../common/secrets";
import type { PrismaService } from "../../prisma.service";
import type { GatewayTransactionsService } from "../infrastructure/gateway-transactions.service";

// Cuentas de pasarela del productor (spec producer-gateway-accounts):
// credenciales cifradas, una ACTIVE por productor, adaptador cacheado
// por cuenta y vista segura (nunca material plano ni blob).

const KEY = "b".repeat(64);

type Row = Record<string, unknown>;

function mkPrisma() {
  const accounts: Row[] = [];
  let seq = 0;
  const table = {
    findFirst: vi.fn(
      async ({ where, orderBy }: { where: Row; orderBy?: Row }) => {
        const hits = accounts.filter((a) =>
          Object.entries(where).every(([k, v]) => a[k] === v),
        );
        if (orderBy?.createdAt === "desc") hits.reverse();
        return hits[0] ?? null;
      },
    ),
    findUnique: vi.fn(
      async ({ where }: { where: { id: string } }) =>
        accounts.find((a) => a.id === where.id) ?? null,
    ),
    create: vi.fn(async ({ data }: { data: Row }) => {
      const row: Row = {
        id: `acct-${++seq}`,
        status: "ACTIVE",
        lastError: null,
        verifiedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...data,
      };
      accounts.push(row);
      return row;
    }),
    update: vi.fn(
      async ({ where, data }: { where: { id: string }; data: Row }) => {
        const row = accounts.find((a) => a.id === where.id);
        if (row) Object.assign(row, data);
        return row;
      },
    ),
    updateMany: vi.fn(
      async ({ where, data }: { where: Row; data: Row }) => {
        let count = 0;
        for (const a of accounts) {
          const match = Object.entries(where).every(([k, v]) => {
            if (v === null) return a[k] === null || a[k] === undefined;
            return a[k] === v;
          });
          if (match) {
            Object.assign(a, data);
            count++;
          }
        }
        return { count };
      },
    ),
  };
  const prisma = {
    producerGatewayAccount: table,
    $transaction: vi.fn(
      async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({ producerGatewayAccount: table }),
    ),
  };
  return { prisma, accounts };
}

function mkSvc(prisma: unknown) {
  const gatewayTx = {
    record: vi.fn(async () => undefined),
  };
  const svc = new GatewayAccountsService(
    prisma as PrismaService,
    gatewayTx as unknown as GatewayTransactionsService,
  );
  return { svc, gatewayTx };
}

describe("GatewayAccountsService", () => {
  beforeEach(() => {
    process.env.PRODUCER_GATEWAY_KEY = KEY;
  });
  afterEach(() => {
    delete process.env.PRODUCER_GATEWAY_KEY;
  });

  it("upsert cifra credenciales, mask last4 y desactiva la anterior (una ACTIVE)", async () => {
    const { prisma, accounts } = mkPrisma();
    const { svc } = mkSvc(prisma);
    await svc.upsert("prod-1", {
      provider: "FLOW",
      apiKey: "key-1234",
      secret: "sec-9999",
    });
    const second = await svc.upsert("prod-1", {
      provider: "MERCADOPAGO",
      apiKey: "tok-5678",
    });
    expect(accounts).toHaveLength(2);
    expect(accounts[0]!.status).toBe("DISABLED");
    expect(accounts[1]!.status).toBe("ACTIVE");
    // credenciales cifradas y recuperables solo por decrypt
    const blob = accounts[0]!.credentialsEnc as string;
    expect(blob).not.toContain("sec-9999");
    expect(JSON.parse(decryptSecret(blob))).toEqual({
      apiKey: "key-1234",
      secret: "sec-9999",
    });
    expect(second.keyMask).toBe("••••5678");
    // la vista incluye la URL a configurar en el panel del proveedor
    expect(second.webhookUrl).toContain(
      "/api/payments/webhook/MERCADOPAGO?account=",
    );
    // nada del material plano sale por la vista
    expect(JSON.stringify(second)).not.toContain("tok-5678");
  });

  it("validaciones: provider desconocido / sin apiKey / FLOW sin secret", async () => {
    const { prisma } = mkPrisma();
    const { svc } = mkSvc(prisma);
    await expect(
      svc.upsert("p", { provider: "STRIPE", apiKey: "k" }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      svc.upsert("p", { provider: "FLOW", apiKey: "" }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      svc.upsert("p", { provider: "FLOW", apiKey: "k" }),
    ).rejects.toBeInstanceOf(BadRequestException); // falta secret
  });

  it("adapterFor construye el adaptador del provider y lo cachea", async () => {
    const { prisma } = mkPrisma();
    const { svc } = mkSvc(prisma);
    const f = await svc.upsert("p1", {
      provider: "FLOW",
      apiKey: "k",
      secret: "s",
    });
    const m = await svc.upsert("p2", {
      provider: "MERCADOPAGO",
      apiKey: "tok",
    });
    const s = await svc.upsert("p3", { provider: "STUB", apiKey: "x" });
    const flow = (await svc.adapterFor(f.id)).gateway;
    expect(flow).toBeInstanceOf(FlowGateway);
    expect(flow.name).toBe("FLOW");
    expect((await svc.adapterFor(m.id)).gateway).toBeInstanceOf(
      MercadoPagoGateway,
    );
    const stub = (await svc.adapterFor(s.id)).gateway;
    expect(stub).toBeInstanceOf(StubGateway);
    // misma cuenta → misma instancia (el stub guarda estado en memoria)
    expect((await svc.adapterFor(s.id)).gateway).toBe(stub);
  });

  it("adapterFor: cuenta inexistente o DISABLED → NotFound (fail-closed)", async () => {
    const { prisma } = mkPrisma();
    const { svc } = mkSvc(prisma);
    const a = await svc.upsert("p1", { provider: "STUB", apiKey: "x" });
    await svc.disable(a.id, "p1");
    await expect(svc.adapterFor("nope")).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(svc.adapterFor(a.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("activeForProducer: null sin cuenta; con cuenta → {account, gateway}", async () => {
    const { prisma } = mkPrisma();
    const { svc } = mkSvc(prisma);
    expect(await svc.activeForProducer("p1")).toBeNull();
    await svc.upsert("p1", { provider: "STUB", apiKey: "x" });
    const own = await svc.activeForProducer("p1");
    expect(own?.account.provider).toBe("STUB");
    expect(own?.gateway).toBeInstanceOf(StubGateway);
  });

  it("viewForProducer devuelve la vista masked sin credenciales", async () => {
    const { prisma } = mkPrisma();
    const { svc } = mkSvc(prisma);
    await svc.upsert("p1", {
      provider: "FLOW",
      apiKey: "live-key-7777",
      secret: "super-secret",
    });
    const view = await svc.viewForProducer("p1");
    expect(view?.keyMask).toBe("••••7777");
    const raw = JSON.stringify(view);
    expect(raw).not.toContain("live-key-7777");
    expect(raw).not.toContain("super-secret");
    expect(raw).not.toContain("credentialsEnc");
  });

  it("el adaptador de la cuenta audita con gatewayAccountId y estampa verifiedAt/lastError", async () => {
    const { prisma, accounts } = mkPrisma();
    const { svc, gatewayTx } = mkSvc(prisma);
    const a = await svc.upsert("p1", {
      provider: "FLOW",
      apiKey: "k",
      secret: "s",
    });
    const { gateway } = await svc.adapterFor(a.id);
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            url: "https://flow.example/pay",
            token: "tok-1",
            flowOrder: 42,
          }),
          { status: 200 },
        ),
      );
    await gateway.createOrder({
      refId: "tkt_x",
      amount: 1000,
      email: "a@b.cl",
      returnUrl: "https://app/return",
    });
    // la tx queda atribuida a la cuenta del productor
    expect(gatewayTx.record).toHaveBeenCalledWith(
      expect.objectContaining({
        gatewayAccountId: a.id,
        endpoint: "payment/create",
        ok: true,
      }),
    );
    // call exitoso → verifiedAt estampado
    expect(accounts[0]!.verifiedAt).toBeInstanceOf(Date);
    expect(accounts[0]!.lastError).toBeNull();
    // call fallido → lastError truncado en la cuenta
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ code: 101, message: "bad key" }), {
        status: 401,
      }),
    );
    await expect(
      gateway.refreshStatus!("tkt_x"),
    ).rejects.toThrow();
    expect(accounts[0]!.lastError).toContain("bad key");
    fetchMock.mockRestore();
  });
});
