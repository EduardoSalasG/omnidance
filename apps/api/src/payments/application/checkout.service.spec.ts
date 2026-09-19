import { describe, it, expect, beforeEach, vi } from "vitest";
import type { PrismaService } from "../../prisma.service";
import type { ParamsService } from "../../params/params.service";
import type { ProducerFeeDefaults } from "../../params/params.service";
import type { PaymentGateway } from "../domain/ports";
import { PricingService } from "../domain/pricing.service";
import {
  decodeSeriesPassRef,
  decodeTicketOrderRef,
} from "../domain/order-ref";
import {
  CheckoutService,
  EventNotFoundError,
  InvalidDiscountError,
  PresaleSoldOutError,
  PresaleUnavailableError,
  SeriesInactiveError,
  SeriesNotFoundError,
  SeriesPassAlreadyOwnedError,
} from "./checkout.service";

// CheckoutService — orquestación del checkout de preventa / pase de serie.
// El foco es la cadena de resolución de fee (override del evento →
// ProducerParams → PlatformParam → default) y la creación de la orden
// PENDING + handoff a la pasarela. PrismaService se mockea como objeto
// plano con vi.fn(); el gateway es un fake del puerto hexagonal.

interface StoredPayment {
  id: string;
  [key: string]: unknown;
}

function mkPrisma() {
  const payments: StoredPayment[] = [];
  const songSuggestions: { eventId: string; personId: string; title: string }[] =
    [];
  const prisma = {
    event: { findUnique: vi.fn() },
    ticket: { count: vi.fn(async () => 0) },
    payment: {
      count: vi.fn(
        async (args?: {
          where: {
            orderType?: string;
            status?: string;
            eventId?: string;
            createdAt?: { gt?: Date };
          };
        }) => {
          void args;
          return 0;
        },
      ),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row: StoredPayment = {
          id: `pay-${payments.length + 1}`,
          ...data,
        };
        payments.push(row);
        return row;
      }),
      update: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: Record<string, unknown>;
        }) => ({ id: where.id, ...data }),
      ),
    },
    discountCode: {
      findUnique: vi.fn(
        async (): Promise<Record<string, unknown> | null> => null,
      ),
    },
    person: {
      findUnique: vi.fn(async () => ({ email: "fan@example.cl" })),
    },
    songSuggestion: {
      deleteMany: vi.fn(async () => ({ count: 0 })),
      create: vi.fn(
        async ({
          data,
        }: {
          data: { eventId: string; personId: string; title: string };
        }) => {
          songSuggestions.push(data);
          return data;
        },
      ),
    },
    eventSeries: { findUnique: vi.fn() },
    seriesPass: {
      findUnique: vi.fn(async (): Promise<{ id: string } | null> => null),
    },
  };
  return { prisma, payments, songSuggestions };
}

function mkParams() {
  const numbers = new Map<string, number>();
  const producers = new Map<string, ProducerFeeDefaults>();
  const params = {
    getNumber: vi.fn(
      async (key: string, fallback: number) => numbers.get(key) ?? fallback,
    ),
    getProducerParams: vi.fn(
      async (producerId: string | null | undefined) =>
        producerId ? (producers.get(producerId) ?? null) : null,
    ),
  };
  return { params, numbers, producers };
}

function mkGateway() {
  const createOrder = vi.fn(
    async (p: {
      refId: string;
      amount: number;
      email: string;
      returnUrl: string;
    }) => ({
      paymentUrl: `https://pay.example/${p.refId}`,
      gatewayRef: `gw-${p.refId}`,
    }),
  );
  const gateway: PaymentGateway = {
    name: "STUB",
    createOrder,
    verifyWebhook: vi.fn(),
  };
  return { gateway, createOrder };
}

type PrismaMock = ReturnType<typeof mkPrisma>["prisma"];

const mkEvent = (over: Record<string, unknown> = {}) => ({
  id: "evt-1",
  status: "PUBLISHED",
  presalePrice: 10000,
  presaleCap: null,
  seriesId: null,
  serviceFeeClp: null,
  producerId: "prod-1",
  ...over,
});

const mkCode = (over: Record<string, unknown> = {}) => ({
  id: "code-1",
  eventId: null,
  seriesId: null,
  percentOff: null,
  amountOff: null,
  maxUses: null,
  usedCount: 0,
  expiresAt: null,
  ...over,
});

describe("CheckoutService.purchaseTicket", () => {
  let fx: ReturnType<typeof mkPrisma>;
  let pf: ReturnType<typeof mkParams>;
  let gw: ReturnType<typeof mkGateway>;
  let svc: CheckoutService;

  beforeEach(() => {
    fx = mkPrisma();
    pf = mkParams();
    gw = mkGateway();
    fx.prisma.event.findUnique.mockResolvedValue(mkEvent());
    svc = new CheckoutService(
      fx.prisma as unknown as PrismaService,
      gw.gateway,
      new PricingService(),
      pf.params as unknown as ParamsService,
    );
  });

  const buy = (input: Record<string, unknown> = {}) =>
    svc.purchaseTicket("per-1", { eventId: "evt-1", ...input });

  // ─── Errores de disponibilidad ───

  it("evento inexistente → EventNotFoundError", async () => {
    fx.prisma.event.findUnique.mockResolvedValue(null);
    await expect(buy()).rejects.toBeInstanceOf(EventNotFoundError);
  });

  it("evento no PUBLISHED → PresaleUnavailableError", async () => {
    fx.prisma.event.findUnique.mockResolvedValue(mkEvent({ status: "DRAFT" }));
    await expect(buy()).rejects.toBeInstanceOf(PresaleUnavailableError);
  });

  it("evento sin presalePrice → PresaleUnavailableError", async () => {
    fx.prisma.event.findUnique.mockResolvedValue(
      mkEvent({ presalePrice: null }),
    );
    await expect(buy()).rejects.toBeInstanceOf(PresaleUnavailableError);
  });

  it("cap: vendidos + órdenes PENDING en vuelo >= presaleCap → PresaleSoldOutError", async () => {
    fx.prisma.event.findUnique.mockResolvedValue(mkEvent({ presaleCap: 5 }));
    fx.prisma.ticket.count.mockResolvedValue(3);
    fx.prisma.payment.count.mockResolvedValue(2);
    await expect(buy()).rejects.toBeInstanceOf(PresaleSoldOutError);
  });

  it("cap: el conteo de PENDING solo mira órdenes recientes (TTL 30min) del evento", async () => {
    fx.prisma.event.findUnique.mockResolvedValue(mkEvent({ presaleCap: 5 }));
    fx.prisma.ticket.count.mockResolvedValue(3);
    fx.prisma.payment.count.mockResolvedValue(1); // 3 + 1 < 5 → vende
    await buy();
    const where = fx.prisma.payment.count.mock.calls[0]![0]!.where;
    expect(where.orderType).toBe("TICKET");
    expect(where.status).toBe("PENDING");
    expect(where.eventId).toBe("evt-1");
    // createdAt.gt ≈ now − 30min (tolerancia de 5s por el tiempo del test)
    const gt = where.createdAt!.gt!.getTime();
    expect(Date.now() - gt).toBeGreaterThanOrEqual(30 * 60 * 1000);
    expect(Date.now() - gt).toBeLessThan(30 * 60 * 1000 + 5000);
  });

  // ─── Cadena de resolución del service fee ───

  it("fee: override del evento gana a ProducerParams y al param global", async () => {
    fx.prisma.event.findUnique.mockResolvedValue(
      mkEvent({ serviceFeeClp: 900 }),
    );
    pf.producers.set("prod-1", {
      serviceFeeClp: 650,
      doorAppFeeClp: null,
      doorCashFeeClp: null,
      platformFeePct: null,
    });
    pf.numbers.set("service_fee.presale_clp", 800);
    const res = await buy();
    expect(res.quote.serviceFee).toBe(900);
    expect(res.quote.total).toBe(10900);
  });

  it("fee: sin override del evento, gana ProducerParams.serviceFeeClp", async () => {
    pf.producers.set("prod-1", {
      serviceFeeClp: 650,
      doorAppFeeClp: null,
      doorCashFeeClp: null,
      platformFeePct: null,
    });
    pf.numbers.set("service_fee.presale_clp", 800);
    const res = await buy();
    expect(res.quote.serviceFee).toBe(650);
  });

  it("fee: sin evento ni productor, gana el PlatformParam service_fee.presale_clp", async () => {
    pf.numbers.set("service_fee.presale_clp", 800);
    const res = await buy();
    expect(res.quote.serviceFee).toBe(800);
  });

  it("fee: sin nada configurado cae al default del shared (500)", async () => {
    const res = await buy();
    expect(res.quote.serviceFee).toBe(500);
    expect(res.quote.total).toBe(10500);
    // el fallback que se pasó a getNumber es SERVICE_FEE.PRESALE_CLP
    expect(pf.params.getNumber).toHaveBeenCalledWith(
      "service_fee.presale_clp",
      500,
    );
  });

  it("evento sin productor: getProducerParams no se consulta en DB (short-circuit null)", async () => {
    fx.prisma.event.findUnique.mockResolvedValue(mkEvent({ producerId: null }));
    const res = await buy();
    expect(res.quote.serviceFee).toBe(500);
    expect(pf.params.getProducerParams).toHaveBeenCalledWith(null);
  });

  // ─── Descuentos ───

  it("código percentOff válido descuenta la lista y queda en Payment.discountCodeId", async () => {
    fx.prisma.discountCode.findUnique.mockResolvedValue(
      mkCode({ id: "code-9", percentOff: 50 }),
    );
    const res = await buy({ discountCode: "MITAD" });
    expect(res.quote.discount).toBe(5000);
    expect(res.quote.total).toBe(5500); // 5000 neto + 500 fee
    expect(fx.payments[0].discountCodeId).toBe("code-9");
  });

  it("código scoped a otro evento → InvalidDiscountError SCOPE_MISMATCH", async () => {
    fx.prisma.discountCode.findUnique.mockResolvedValue(
      mkCode({ eventId: "evt-otro" }),
    );
    await expect(buy({ discountCode: "X" })).rejects.toBeInstanceOf(
      InvalidDiscountError,
    );
    await expect(buy({ discountCode: "X" })).rejects.toThrow(
      "código no aplica a este evento",
    );
    expect(fx.payments).toHaveLength(0);
  });

  it("código inexistente → InvalidDiscountError UNKNOWN", async () => {
    await expect(buy({ discountCode: "NOPE" })).rejects.toThrow(
      "código inválido",
    );
  });

  it("código expirado → InvalidDiscountError EXPIRED", async () => {
    fx.prisma.discountCode.findUnique.mockResolvedValue(
      mkCode({ expiresAt: new Date(Date.now() - 1000) }),
    );
    await expect(buy({ discountCode: "OLD" })).rejects.toThrow(
      "código expirado",
    );
  });

  it("código agotado (usedCount >= maxUses) → InvalidDiscountError EXHAUSTED", async () => {
    fx.prisma.discountCode.findUnique.mockResolvedValue(
      mkCode({ maxUses: 3, usedCount: 3 }),
    );
    await expect(buy({ discountCode: "FULL" })).rejects.toThrow(
      "código agotado",
    );
  });

  // ─── Orden PENDING + pasarela ───

  it("crea Payment PENDING con contexto desnormalizado y refId decodificable", async () => {
    fx.prisma.discountCode.findUnique.mockResolvedValue(
      mkCode({ id: "code-1", percentOff: 10 }),
    );
    const res = await buy({ discountCode: "DIEZ" });
    const p = fx.payments[0];
    expect(p.orderType).toBe("TICKET");
    expect(p.personId).toBe("per-1");
    expect(p.eventId).toBe("evt-1");
    expect(p.discountCodeId).toBe("code-1");
    expect(p.amount).toBe(res.quote.total);
    expect(p.fee).toBe(0);
    expect(p.net).toBe(res.quote.total);
    expect(p.gateway).toBe("STUB");
    const ref = decodeTicketOrderRef(p.refId as string);
    expect(ref?.eventId).toBe("evt-1");
    expect(ref?.codeId).toBe("code-1");
  });

  it("delega el cobro al gateway con amount/email/returnUrl y persiste gatewayRef", async () => {
    const res = await buy();
    expect(gw.createOrder).toHaveBeenCalledTimes(1);
    const orderArgs = gw.createOrder.mock.calls[0]![0];
    expect(orderArgs.amount).toBe(res.quote.total);
    expect(orderArgs.email).toBe("fan@example.cl");
    expect(orderArgs.refId).toBe(fx.payments[0].refId);
    expect(orderArgs.returnUrl).toContain(
      `/checkout/return?paymentId=${res.paymentId}`,
    );
    expect(fx.prisma.payment.update).toHaveBeenCalledWith({
      where: { id: res.paymentId },
      data: { gatewayRef: `gw-${fx.payments[0].refId}` },
    });
    expect(res.paymentUrl).toBe(`https://pay.example/${fx.payments[0].refId}`);
  });

  // ─── Sugerencia de canción ───

  it("songSuggestion reemplaza la anterior (deleteMany + create) y normaliza espacios", async () => {
    await buy({ songSuggestion: "  La   Murga   de Panama  " });
    expect(fx.prisma.songSuggestion.deleteMany).toHaveBeenCalledWith({
      where: { eventId: "evt-1", personId: "per-1" },
    });
    expect(fx.songSuggestions).toEqual([
      { eventId: "evt-1", personId: "per-1", title: "La Murga de Panama" },
    ]);
  });

  it("sin songSuggestion (o solo espacios) no toca la tabla", async () => {
    await buy();
    await buy({ songSuggestion: "   " });
    expect(fx.prisma.songSuggestion.create).not.toHaveBeenCalled();
    expect(fx.prisma.songSuggestion.deleteMany).not.toHaveBeenCalled();
  });
});

describe("CheckoutService.purchaseSeriesPass", () => {
  let fx: ReturnType<typeof mkPrisma>;
  let pf: ReturnType<typeof mkParams>;
  let gw: ReturnType<typeof mkGateway>;
  let svc: CheckoutService;

  beforeEach(() => {
    fx = mkPrisma();
    pf = mkParams();
    gw = mkGateway();
    fx.prisma.eventSeries.findUnique.mockResolvedValue({
      id: "ser-1",
      active: true,
      producerId: "prod-1",
    });
    svc = new CheckoutService(
      fx.prisma as unknown as PrismaService,
      gw.gateway,
      new PricingService(),
      pf.params as unknown as ParamsService,
    );
  });

  const buy = () =>
    svc.purchaseSeriesPass("per-1", { seriesId: "ser-1", month: "2025-11" });

  it("serie inexistente → SeriesNotFoundError", async () => {
    fx.prisma.eventSeries.findUnique.mockResolvedValue(null);
    await expect(buy()).rejects.toBeInstanceOf(SeriesNotFoundError);
  });

  it("serie inactiva → SeriesInactiveError", async () => {
    fx.prisma.eventSeries.findUnique.mockResolvedValue({
      id: "ser-1",
      active: false,
      producerId: "prod-1",
    });
    await expect(buy()).rejects.toBeInstanceOf(SeriesInactiveError);
  });

  it("pase del mes ya emitido → SeriesPassAlreadyOwnedError (409 de dominio)", async () => {
    fx.prisma.seriesPass.findUnique.mockResolvedValue({ id: "sp-1" });
    await expect(buy()).rejects.toBeInstanceOf(SeriesPassAlreadyOwnedError);
    expect(fx.payments).toHaveLength(0);
  });

  it("precio de lista sale del param series_pass.price_clp (default 25000)", async () => {
    pf.numbers.set("series_pass.price_clp", 30000);
    const res = await buy();
    expect(res.quote.listPrice).toBe(30000);
  });

  it("fee: ProducerParams.serviceFeeClp gana al param global", async () => {
    pf.producers.set("prod-1", {
      serviceFeeClp: 1200,
      doorAppFeeClp: null,
      doorCashFeeClp: null,
      platformFeePct: null,
    });
    pf.numbers.set("service_fee.series_pass_clp", 999);
    const res = await buy();
    expect(res.quote.serviceFee).toBe(1200);
  });

  it("fee: sin productor params cae a service_fee.series_pass_clp (default 500)", async () => {
    const res = await buy();
    expect(res.quote.serviceFee).toBe(500);
    expect(pf.params.getNumber).toHaveBeenCalledWith(
      "service_fee.series_pass_clp",
      500,
    );
  });

  it("crea Payment SERIES_PASS sin evento/descuento; refId codifica serie+mes", async () => {
    const res = await buy();
    const p = fx.payments[0];
    expect(p.orderType).toBe("SERIES_PASS");
    expect(p.eventId).toBeNull();
    expect(p.discountCodeId).toBeNull();
    expect(p.amount).toBe(res.quote.total);
    const ref = decodeSeriesPassRef(p.refId as string);
    expect(ref?.seriesId).toBe("ser-1");
    expect(ref?.month).toBe("2025-11");
  });
});
