import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { PrismaService } from "../../prisma.service";
import type { ParamsService } from "../../params/params.service";
import type { ProducerFeeDefaults } from "../../params/params.service";
import type { PaymentGateway } from "../domain/ports";
import { GatewayRegistry } from "../domain/gateway-registry";
import { PricingService } from "../domain/pricing.service";
import {
  decodeClassRef,
  decodePrivateRef,
  decodeSeriesPassRef,
  decodeTicketOrderRef,
} from "../domain/order-ref";
import {
  CheckoutService,
  AcademyNotFoundError,
  AcademyUnavailableError,
  EventNotFoundError,
  InvalidDiscountError,
  PlanNotFoundError,
  PlanNotPurchasableError,
  PresaleSoldOutError,
  PresaleUnavailableError,
  PrivateClassNotPurchasableError,
  SeriesInactiveError,
  SeriesNotFoundError,
  SeriesPassAlreadyOwnedError,
  RecipientError,
  PresaleClosedError,
  DoorSoldOutError,
} from "./checkout.service";

// CheckoutService - orquestación del checkout de preventa / pase de serie.
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
  const paymentEvents: Record<string, unknown>[] = [];
  const songSuggestions: { eventId: string; personId: string; title: string }[] =
    [];
  const prisma = {
    event: { findUnique: vi.fn() },
    checkin: { count: vi.fn(async () => 0) },
    ticket: {
      count: vi.fn(async () => 0),
      findMany: vi.fn(async () => [] as { ownerId: string }[]),
    },
    payment: {
      aggregate: vi.fn(
        async (args?: {
          where: {
            orderType?: string;
            status?: string;
            eventId?: string;
            createdAt?: { gt?: Date };
          };
        }) => {
          void args;
          return { _sum: { quantity: 0 } };
        },
      ),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row: StoredPayment = {
          id: `pay-${payments.length + 1}`,
          // default @default("CLP") del schema - el fake lo aplica como
          // haría Prisma real (checkout.service lo lee para createOrder).
          currency: "CLP",
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
      findMany: vi.fn(
        async ({
          where,
        }: {
          where: { id: { in: string[] } };
        }): Promise<{ id: string; name: string }[]> =>
          where.id.in.map((id) => ({ id, name: `Persona ${id}` })),
      ),
    },
    friendship: {
      findMany: vi.fn(async () => [] as { aId: string; bId: string }[]),
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
    class: { findUnique: vi.fn() },
    academy: { findUnique: vi.fn() },
    classBooking: {
      count: vi.fn(async () => 0),
      findFirst: vi.fn(
        async (): Promise<{ id: string; status: string } | null> => null,
      ),
    },
    membershipPlan: { findUnique: vi.fn() },
    enrollment: {
      findFirst: vi.fn(
        async (): Promise<{ endsAt: Date | null } | null> => null,
      ),
    },
    membershipSubscription: {
      findFirst: vi.fn(
        async (): Promise<Record<string, unknown> | null> => null,
      ),
    },
    paymentEvent: {
      findFirst: vi.fn(async () => null),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        paymentEvents.push(data);
        return data;
      }),
    },
    $executeRaw: vi.fn(async () => 0),
  };
  // $transaction pasa el mismo prisma como tx - el emit de ledger usa
  // paymentEvent.create/$executeRaw sobre el cliente transaccional.
  (prisma as Record<string, unknown>).$transaction = vi.fn(
    async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma),
  );
  return { prisma, payments, songSuggestions, paymentEvents };
}

function mkParams() {
  const numbers = new Map<string, number>();
  const strings = new Map<string, unknown>();
  const producers = new Map<string, ProducerFeeDefaults>();
  const params = {
    getNumber: vi.fn(
      async (key: string, fallback: number) => numbers.get(key) ?? fallback,
    ),
    get: vi.fn(async (key: string) => strings.get(key)),
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
      currency?: string;
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
  return {
    gateway,
    createOrder,
    registry: new GatewayRegistry([gateway], "STUB"),
  };
}

type PrismaMock = ReturnType<typeof mkPrisma>["prisma"];

// Stub de GatewayAccountsService (spec producer-gateway-accounts): sin
// cuentas → las órdenes salen por el default de la plataforma como
// siempre. Los tests OWN_GATEWAY sobreescriben activeForProducer.
const accountsStub = {
  activeForProducer: vi.fn(async () => null),
  adapterFor: vi.fn(),
};

// Settlement real se cubre en su propio spec - acá solo interesa que el
// camino $0 lo invoque; los checkouts con monto ni siquiera lo tocan.
const mkSettlement = () => ({
  settle: vi.fn(async () => ({ ok: true, status: "PAID" as const })),
});

const mkEvent = (over: Record<string, unknown> = {}) => ({
  id: "evt-1",
  status: "PUBLISHED",
  // mañana 22:00 - la preventa sigue abierta (corte: 19:00 del día)
  startsAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  endsAt: new Date(Date.now() + 26 * 60 * 60 * 1000),
  presalePrice: 10000,
  presaleCap: null,
  doorPrice: null,
  doorCap: null,
  doorAppFeeClp: null,
  seriesId: null,
  serviceFeeClp: null,
  platformFeePct: null,
  presaleCutoffMinutes: null,
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
  let stl: { settle: ReturnType<typeof vi.fn> };
  let svc: CheckoutService;

  beforeEach(() => {
    fx = mkPrisma();
    pf = mkParams();
    gw = mkGateway();
    stl = {
      settle: vi.fn(async () => ({ ok: true, status: "PAID" as const })),
    };
    fx.prisma.event.findUnique.mockResolvedValue(mkEvent());
    svc = new CheckoutService(
      fx.prisma as unknown as PrismaService,
      gw.gateway,
      new PricingService(),
      pf.params as unknown as ParamsService,
      stl as never,
      gw.registry,
      accountsStub as never,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
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

  it("pasado el corte (19:00 del día del evento) → PresaleClosedError", async () => {
    // startsAt ayer → el corte de las 19:00 de ese día ya pasó (determinista:
    // now-1h a la 1AM deja el cutoff del mismo día en el futuro)
    fx.prisma.event.findUnique.mockResolvedValue(
      mkEvent({ startsAt: new Date(Date.now() - 25 * 60 * 60 * 1000) }),
    );
    await expect(buy()).rejects.toBeInstanceOf(PresaleClosedError);
  });

  it("el corte respeta presale.cutoff_hour del PlatformParam", async () => {
    // evento mañana - cualquier cutoff razonable queda abierto
    pf.numbers.set("presale.cutoff_hour", 23);
    await buy(); // no lanza
    expect(pf.params.getNumber).toHaveBeenCalledWith(
      "presale.cutoff_hour",
      19,
    );
  });

  it("cap: vendidos + órdenes PENDING en vuelo >= presaleCap → PresaleSoldOutError", async () => {
    fx.prisma.event.findUnique.mockResolvedValue(mkEvent({ presaleCap: 5 }));
    fx.prisma.ticket.count.mockResolvedValue(3);
    fx.prisma.payment.aggregate.mockResolvedValue({
      _sum: { quantity: 2 },
    });
    await expect(buy()).rejects.toBeInstanceOf(PresaleSoldOutError);
  });

  it("cap: el conteo de PENDING solo mira órdenes recientes (TTL 30min) del evento", async () => {
    fx.prisma.event.findUnique.mockResolvedValue(mkEvent({ presaleCap: 5 }));
    fx.prisma.ticket.count.mockResolvedValue(3);
    fx.prisma.payment.aggregate.mockResolvedValue({
      _sum: { quantity: 1 },
    }); // 3 + 1 < 5 → vende
    await buy();
    const where = fx.prisma.payment.aggregate.mock.calls[0]![0]!.where;
    expect(where.orderType).toBe("TICKET");
    expect(where.status).toBe("PENDING");
    expect(where.eventId).toBe("evt-1");
    // createdAt.gt ≈ now − 30min (tolerancia de 5s por el tiempo del test)
    const gt = where.createdAt!.gt!.getTime();
    expect(Date.now() - gt).toBeGreaterThanOrEqual(30 * 60 * 1000);
    expect(Date.now() - gt).toBeLessThan(30 * 60 * 1000 + 5000);
  });

  // ─── Canal puerta-app (LIVE / post-corte) ───

  it("evento LIVE con doorPrice → vende a precio puerta y persiste channel DOOR", async () => {
    fx.prisma.event.findUnique.mockResolvedValue(
      mkEvent({
        status: "LIVE",
        startsAt: new Date(Date.now() - 60 * 60 * 1000),
        doorPrice: 7000,
      }),
    );
    const res = await buy();
    expect(res.quote.listPrice).toBe(7000);
    // El comprador paga exactamente la puerta - la comisión sale del
    // productor en liquidación (producer-fee-model).
    expect(res.quote.total).toBe(7000);
    const p = fx.payments[0]!;
    expect(p.channel).toBe("DOOR");
    expect(p.unitListPrice).toBe(7000);
    expect(p.unitServiceFee).toBe(0);
    expect(p.feeMode).toBe("MANAGED");
  });

  it("evento LIVE sin doorPrice → PresaleUnavailableError", async () => {
    fx.prisma.event.findUnique.mockResolvedValue(
      mkEvent({ status: "LIVE", doorPrice: null }),
    );
    await expect(buy()).rejects.toBeInstanceOf(PresaleUnavailableError);
  });

  it("PUBLISHED post-corte con doorPrice → canal DOOR (la app vende a precio puerta)", async () => {
    fx.prisma.event.findUnique.mockResolvedValue(
      mkEvent({
        // ayer → el cutoff de las 19:00 de ese día ya pasó (determinista)
        startsAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
        doorPrice: 8000,
      }),
    );
    const res = await buy();
    expect(res.quote.listPrice).toBe(8000);
    expect(fx.payments[0]!.channel).toBe("DOOR");
  });

  it("PUBLISHED post-corte sin doorPrice → PresaleClosedError (sin puerta app)", async () => {
    fx.prisma.event.findUnique.mockResolvedValue(
      mkEvent({ startsAt: new Date(Date.now() - 25 * 60 * 60 * 1000) }),
    );
    await expect(buy()).rejects.toBeInstanceOf(PresaleClosedError);
  });

  // ─── Corte de preventa por evento/productor (event-presale-cutoff) ───
  // Fechas fijas con fake timers: el corte se deriva del DÍA del evento
  // (medianoche + minutos), así que fijamos el reloj en esa fecha.

  it("override del evento: preventa $0 abierta a las 23:30 con corte 23:45 → PRESALE", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 14, 23, 30)); // mié 14 oct, 23:30
    fx.prisma.event.findUnique.mockResolvedValue(
      mkEvent({
        startsAt: new Date(2026, 9, 14, 21, 0),
        endsAt: new Date(2026, 9, 15, 2, 0),
        presalePrice: 0,
        doorPrice: 5000,
        presaleCutoffMinutes: 23 * 60 + 45,
      }),
    );
    const res = await buy();
    expect(fx.payments[0]!.channel).toBe("PRESALE");
    expect(res.quote.total).toBe(0);
  });

  it("pasado el corte del evento (23:46 > 23:45) con puerta → canal DOOR", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 14, 23, 46));
    fx.prisma.event.findUnique.mockResolvedValue(
      mkEvent({
        startsAt: new Date(2026, 9, 14, 21, 0),
        endsAt: new Date(2026, 9, 15, 2, 0),
        presalePrice: 0,
        doorPrice: 5000,
        presaleCutoffMinutes: 23 * 60 + 45,
      }),
    );
    const res = await buy();
    expect(fx.payments[0]!.channel).toBe("DOOR");
    expect(res.quote.listPrice).toBe(5000);
    expect(gw.createOrder).toHaveBeenCalledTimes(1); // puerta > 0 → pasarela
  });

  it("sin override del evento gobierna el default del productor sobre el global", async () => {
    vi.useFakeTimers();
    // 20:00: el global (19:00) ya habría cerrado; el productor corta 21:00.
    vi.setSystemTime(new Date(2026, 9, 14, 20, 0));
    pf.producers.set("prod-1", {
      platformFeePct: null,
      presaleCutoffMinutes: 21 * 60,
    });
    fx.prisma.event.findUnique.mockResolvedValue(
      mkEvent({
        startsAt: new Date(2026, 9, 14, 22, 0),
        endsAt: new Date(2026, 9, 15, 4, 0),
        presaleCutoffMinutes: null,
      }),
    );
    const res = await buy();
    expect(fx.payments[0]!.channel).toBe("PRESALE");
    expect(res.quote.listPrice).toBe(10000);
  });

  it("el default del productor también corta: 22:00 > 21:00 sin puerta → PresaleClosedError", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 14, 22, 0));
    pf.producers.set("prod-1", {
      platformFeePct: null,
      presaleCutoffMinutes: 21 * 60,
    });
    fx.prisma.event.findUnique.mockResolvedValue(
      mkEvent({
        startsAt: new Date(2026, 9, 14, 23, 0),
        endsAt: new Date(2026, 9, 15, 4, 0),
        presaleCutoffMinutes: null,
      }),
    );
    await expect(buy()).rejects.toBeInstanceOf(PresaleClosedError);
  });

  it("corte post-medianoche (1500 = 01:00 del día siguiente) sigue abierto a las 00:30", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 15, 0, 30)); // 00:30 del día 15
    fx.prisma.event.findUnique.mockResolvedValue(
      mkEvent({
        startsAt: new Date(2026, 9, 14, 22, 0),
        endsAt: new Date(2026, 9, 15, 4, 0),
        presaleCutoffMinutes: 25 * 60,
      }),
    );
    await buy();
    expect(fx.payments[0]!.channel).toBe("PRESALE");
  });

  // ─── Orden con total $0: sin pasarela, liquida al instante ───

  it("preventa $0: no llama al gateway, pago PAID gateway FREE y paymentUrl = retorno", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 14, 23, 30));
    fx.prisma.event.findUnique.mockResolvedValue(
      mkEvent({
        startsAt: new Date(2026, 9, 14, 21, 0),
        endsAt: new Date(2026, 9, 15, 2, 0),
        presalePrice: 0,
        doorPrice: 5000,
        presaleCutoffMinutes: 23 * 60 + 45,
      }),
    );
    const res = await buy();
    expect(gw.createOrder).not.toHaveBeenCalled();
    const p = fx.payments[0]!;
    expect(p.gateway).toBe("FREE");
    expect(p.amount).toBe(0);
    expect(stl.settle).toHaveBeenCalledTimes(1);
    expect(stl.settle.mock.calls[0]![0]!.id).toBe(p.id);
    expect(stl.settle.mock.calls[0]![1]).toBe("PAID");
    expect(res.paymentUrl).toContain(`/checkout/return?paymentId=${p.id}`);
  });

  it("descuento 100% deja la orden en $0 → mismo camino sin pasarela", async () => {
    fx.prisma.discountCode.findUnique.mockResolvedValue(
      mkCode({ percentOff: 100 }),
    );
    const res = await buy({ discountCode: "FREE100" });
    expect(res.quote.total).toBe(0);
    expect(gw.createOrder).not.toHaveBeenCalled();
    expect(fx.payments[0]!.gateway).toBe("FREE");
    expect(stl.settle).toHaveBeenCalledTimes(1);
  });

  it("doorCap: ventas staff (MANUAL) + órdenes DOOR alcanzan el cap → DoorSoldOutError", async () => {
    fx.prisma.event.findUnique.mockResolvedValue(
      mkEvent({
        status: "LIVE",
        startsAt: new Date(Date.now() - 60 * 60 * 1000),
        doorPrice: 7000,
        doorCap: 10,
      }),
    );
    fx.prisma.checkin.count.mockResolvedValue(8); // staff ya registró 8 en puerta
    fx.prisma.payment.aggregate.mockResolvedValue({ _sum: { quantity: 1 } });
    await expect(buy({ quantity: 2 })).rejects.toBeInstanceOf(
      DoorSoldOutError,
    );
  });

  it("doorCap: cabe justo → vende", async () => {
    fx.prisma.event.findUnique.mockResolvedValue(
      mkEvent({
        status: "LIVE",
        startsAt: new Date(Date.now() - 60 * 60 * 1000),
        doorPrice: 7000,
        doorCap: 10,
      }),
    );
    fx.prisma.checkin.count.mockResolvedValue(8);
    const res = await buy({ quantity: 2 }); // 8 + 0 + 2 = 10 = cap
    expect(res.quantity).toBe(2);
  });

  it("comisión puerta app: misma tasa todo incluido que la preventa (snapshot platformFeePct)", async () => {
    fx.prisma.event.findUnique.mockResolvedValue(
      mkEvent({
        status: "LIVE",
        startsAt: new Date(Date.now() - 60 * 60 * 1000),
        doorPrice: 7000,
        platformFeePct: 8,
      }),
    );
    const res = await buy();
    const p = fx.payments[0]!;
    // El comprador paga la puerta exacta; el 8% sale del productor.
    expect(res.quote.total).toBe(7000);
    expect(p.platformFeeRate).toBe(8);
    expect(p.producerNetClp).toBe(7000 - Math.round(7000 * 0.08));
  });

  it("órdenes PRESALE siguen persistiendo channel PRESALE + precios unitarios", async () => {
    await buy();
    const p = fx.payments[0]!;
    expect(p.channel).toBe("PRESALE");
    expect(p.unitListPrice).toBe(10000);
    expect(p.unitServiceFee).toBe(0);
  });

  // ─── Regalo multi-entrada (recipientIds) ───

  it("regalo a amigo: quantity=2, recipients persistidos, amount doble", async () => {
    fx.prisma.friendship.findMany.mockResolvedValue([
      { aId: "per-1", bId: "per-2" },
    ]);
    const res = await buy({ recipientIds: ["per-2"] });
    expect(res.quantity).toBe(2);
    // 2 × lista exacta - el comprador no paga comisión.
    expect(res.quote.total).toBe(20000);
    const payment = fx.payments[0]!;
    expect(payment.quantity).toBe(2);
    expect(payment.recipients).toEqual(["per-2"]);
    expect(payment.amount).toBe(20000);
  });

  it("destinatario inexistente → RecipientError", async () => {
    fx.prisma.person.findMany.mockResolvedValue([]); // nadie encontrado
    await expect(buy({ recipientIds: ["ghost-1"] })).rejects.toBeInstanceOf(
      RecipientError,
    );
  });

  it("destinatario no amigo → RecipientError nombrando a la persona", async () => {
    // friendship.findMany queda [] (default) → no ACCEPTED
    await expect(buy({ recipientIds: ["per-2"] })).rejects.toBeInstanceOf(
      RecipientError,
    );
    await expect(
      buy({ recipientIds: ["per-2"] }),
    ).rejects.toThrow("Persona per-2 no es tu amigo");
  });

  it("destinatario con entrada ACTIVE ya → RecipientError", async () => {
    fx.prisma.friendship.findMany.mockResolvedValue([
      { aId: "per-1", bId: "per-2" },
    ]);
    fx.prisma.ticket.findMany.mockResolvedValue([{ ownerId: "per-2" }]);
    await expect(
      buy({ recipientIds: ["per-2"] }),
    ).rejects.toThrow("ya tiene una entrada");
  });

  it("recipientIds con duplicados y el propio comprador se normalizan", async () => {
    fx.prisma.friendship.findMany.mockResolvedValue([
      { aId: "per-1", bId: "per-2" },
    ]);
    const res = await buy({
      recipientIds: ["per-1", "per-2", "per-2"],
    });
    expect(res.quantity).toBe(2); // self filtrado + dedupe
    expect(fx.payments[0]!.recipients).toEqual(["per-2"]);
  });

  // ─── Cantidad de la orden (quantity + reclamables) ───

  it("quantity sin amigos: orden de 3 → 1 propia + 2 reclamables, total ×3", async () => {
    const res = await buy({ quantity: 3 });
    expect(res.quantity).toBe(3);
    expect(res.quote.total).toBe(3 * 10000);
    const payment = fx.payments[0]!;
    expect(payment.quantity).toBe(3);
    expect(payment.recipients).toBeUndefined(); // sin asignados → NULL
  });

  it("quantity + amigos: 4 entradas, 1 asignada → recipients + sobrantes reclamables", async () => {
    fx.prisma.friendship.findMany.mockResolvedValue([
      { aId: "per-1", bId: "per-2" },
    ]);
    const res = await buy({ quantity: 4, recipientIds: ["per-2"] });
    expect(res.quantity).toBe(4);
    expect(fx.payments[0]!.recipients).toEqual(["per-2"]);
    expect(res.quote.total).toBe(4 * 10000);
  });

  it("más amigos que entradas → RecipientError", async () => {
    fx.prisma.friendship.findMany.mockResolvedValue([
      { aId: "per-1", bId: "per-2" },
      { aId: "per-1", bId: "per-3" },
    ]);
    await expect(
      buy({ quantity: 2, recipientIds: ["per-2", "per-3"] }),
    ).rejects.toThrow("más amigos que entradas");
  });

  it("quantity > 10 clampea a 10; quantity 0/ausente queda en 1", async () => {
    const res = await buy({ quantity: 99 });
    expect(res.quantity).toBe(10);
    const res2 = await buy({ quantity: 0 });
    expect(res2.quantity).toBe(1);
    const res3 = await buy();
    expect(res3.quantity).toBe(1);
  });

  it("cap: quantity 3 con 4 vendidos y cap 5 → PresaleSoldOutError", async () => {
    fx.prisma.event.findUnique.mockResolvedValue(mkEvent({ presaleCap: 5 }));
    fx.prisma.ticket.count.mockResolvedValue(4);
    await expect(buy({ quantity: 3 })).rejects.toBeInstanceOf(
      PresaleSoldOutError,
    );
  });

  it("cap: 4 vendidos + orden de 2 entradas > cap 5 → PresaleSoldOutError", async () => {
    fx.prisma.event.findUnique.mockResolvedValue(mkEvent({ presaleCap: 5 }));
    fx.prisma.ticket.count.mockResolvedValue(4);
    fx.prisma.friendship.findMany.mockResolvedValue([
      { aId: "per-1", bId: "per-2" },
    ]);
    await expect(buy({ recipientIds: ["per-2"] })).rejects.toBeInstanceOf(
      PresaleSoldOutError,
    );
  });

  // ─── Comisión todo incluido al productor (producer-fee-model) ───
  // El comprador paga lista exacta; la tasa se resuelve evento →
  // productor → fees.managed_allin_pct y se congela en el Payment.

  it("descompone el all-in 10%: pasarela al costo + neto + IVA, comprador paga lista", async () => {
    const res = await buy();
    expect(res.quote.total).toBe(10000); // lista exacta, sin fee
    const p = fx.payments[0]!;
    expect(p.feeMode).toBe("MANAGED");
    expect(p.platformFeeRate).toBe(10);
    // $10.000: deducción 1000 = pasarela 319 + bruto 681 (neto 572 + IVA 109)
    expect(p.gatewayFeeExpected).toBe(319);
    expect(p.platformFeeNetClp).toBe(572);
    expect(p.platformFeeVatClp).toBe(109);
    expect(
      (p.gatewayFeeExpected as number) +
        (p.platformFeeNetClp as number) +
        (p.platformFeeVatClp as number),
    ).toBe(1000);
    expect(p.producerNetClp).toBe(9000);
  });

  it("tasa: override del evento (platformFeePct) gana a productor y global", async () => {
    fx.prisma.event.findUnique.mockResolvedValue(
      mkEvent({ platformFeePct: 5 }),
    );
    pf.producers.set("prod-1", {
      platformFeePct: 8,
    });
    pf.numbers.set("fees.managed_allin_pct", 12);
    await buy();
    expect(fx.payments[0]!.platformFeeRate).toBe(5);
    expect(fx.payments[0]!.producerNetClp).toBe(9500);
  });

  it("tasa: sin override del evento gana ProducerParams.platformFeePct (oferta 8%)", async () => {
    pf.producers.set("prod-1", {
      platformFeePct: 8,
    });
    pf.numbers.set("fees.managed_allin_pct", 12);
    await buy();
    const p = fx.payments[0]!;
    expect(p.platformFeeRate).toBe(8);
    expect(p.producerNetClp).toBe(9200);
  });

  it("tasa: sin evento ni productor gana el param fees.managed_allin_pct", async () => {
    pf.numbers.set("fees.managed_allin_pct", 12);
    await buy();
    expect(fx.payments[0]!.platformFeeRate).toBe(12);
  });

  it("tasa: sin nada configurado cae al default 10% todo incluido", async () => {
    await buy();
    expect(fx.payments[0]!.platformFeeRate).toBe(10);
    expect(pf.params.getNumber).toHaveBeenCalledWith(
      "fees.managed_allin_pct",
      10,
    );
  });

  it("evento sin productor: getProducerParams no se consulta en DB (short-circuit null)", async () => {
    fx.prisma.event.findUnique.mockResolvedValue(mkEvent({ producerId: null }));
    await buy();
    expect(fx.payments[0]!.platformFeeRate).toBe(10);
    expect(pf.params.getProducerParams).toHaveBeenCalledWith(null);
  });

  it("emite FEE_ASSESSED en el ledger con el desglose congelado", async () => {
    await buy();
    const ev = fx.paymentEvents.find((e) => e.type === "FEE_ASSESSED");
    expect(ev).toBeDefined();
    const payload = ev!.payload as Record<string, unknown>;
    expect(payload.feeMode).toBe("MANAGED");
    expect(payload.platformFeeRate).toBe(10);
    expect(payload.gatewayFeeExpected).toBe(319);
    expect(payload.producerNetClp).toBe(9000);
  });

  it("orden $0: feeMode FREE, desglose en cero y FEE_ASSESSED lo registra", async () => {
    fx.prisma.discountCode.findUnique.mockResolvedValue(
      mkCode({ percentOff: 100 }),
    );
    await buy({ discountCode: "FREE100" });
    const p = fx.payments[0]!;
    expect(p.feeMode).toBe("FREE");
    expect(p.gatewayFeeExpected).toBe(0);
    expect(p.platformFeeNetClp).toBe(0);
    expect(p.producerNetClp).toBe(0);
    const ev = fx.paymentEvents.find((e) => e.type === "FEE_ASSESSED");
    expect(ev).toBeDefined();
    expect((ev!.payload as Record<string, unknown>).feeMode).toBe("FREE");
  });

  // ─── Descuentos ───

  it("código percentOff válido descuenta la lista y queda en Payment.discountCodeId", async () => {
    fx.prisma.discountCode.findUnique.mockResolvedValue(
      mkCode({ id: "code-9", percentOff: 50 }),
    );
    const res = await buy({ discountCode: "MITAD" });
    expect(res.quote.discount).toBe(5000);
    expect(res.quote.total).toBe(5000); // lista menos descuento, sin fee
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
    // Moneda de la orden persistida viaja al gateway (spec
    // gateway-port-normalization) - el adaptador decide si la soporta.
    expect(orderArgs.currency).toBe("CLP");
    expect(fx.prisma.payment.update).toHaveBeenCalledWith({
      where: { id: res.paymentId },
      data: { gatewayRef: `gw-${fx.payments[0].refId}` },
    });
    expect(res.paymentUrl).toBe(`https://pay.example/${fx.payments[0].refId}`);
  });

  it("productor con cuenta propia → cobra en su adaptador + feeMode OWN_GATEWAY (spec producer-gateway-accounts)", async () => {
    const ownGateway = {
      name: "FLOW",
      createOrder: vi.fn(async () => ({
        paymentUrl: "https://own.example/pay",
        gatewayRef: "own-ref",
      })),
      verifyWebhook: vi.fn(),
    };
    accountsStub.activeForProducer.mockResolvedValueOnce({
      account: { id: "acct-1" },
      gateway: ownGateway,
    } as never);
    const res = await buy();
    expect(accountsStub.activeForProducer).toHaveBeenCalledWith("prod-1");
    // La orden se cobra en SU adaptador - nunca toca el de plataforma.
    expect(ownGateway.createOrder).toHaveBeenCalledTimes(1);
    expect(gw.createOrder).not.toHaveBeenCalled();
    const p = fx.payments[0];
    expect(p.feeMode).toBe("OWN_GATEWAY");
    expect(p.gatewayAccountId).toBe("acct-1");
    expect(p.gateway).toBe("FLOW"); // provider de la cuenta
    // Comisión devengada = all-in − card% (el productor paga su propia
    // pasarela): se netea en su payout como líneas OWN_METHOD_*.
    const amount = p.amount as number;
    expect(p.platformFeeRate).toBeCloseTo(10 - 3.19, 2);
    expect(p.producerNetClp).toBe(
      amount - Math.round((amount * (10 - 3.19)) / 100),
    );
    expect(res.paymentUrl).toBe("https://own.example/pay");
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

describe("CheckoutService.discountQuote", () => {
  // Preview de código para el checkout (GET /checkout/discount-quote):
  // valida redimibilidad y estima el descuento de la orden sobre el
  // canal vigente - nunca crea Payment ni consume uso del código.
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
      mkSettlement() as never,
      gw.registry,
      accountsStub as never,
    );
  });

  const quote = (code = "X") =>
    svc.discountQuote({ eventId: "evt-1", code });

  it("evento inexistente → EventNotFoundError", async () => {
    fx.prisma.event.findUnique.mockResolvedValue(null);
    await expect(quote()).rejects.toBeInstanceOf(EventNotFoundError);
  });

  it("código inexistente → valid:false reason UNKNOWN, sin side-effects", async () => {
    const res = await quote("NOPE");
    expect(res).toEqual({
      valid: false,
      discountClp: 0,
      reason: "UNKNOWN",
    });
    expect(fx.payments).toHaveLength(0);
    expect(gw.createOrder).not.toHaveBeenCalled();
  });

  it("código expirado / agotado / fuera de scope → invalid con su reason", async () => {
    fx.prisma.discountCode.findUnique.mockResolvedValue(
      mkCode({ expiresAt: new Date(Date.now() - 1000) }),
    );
    expect((await quote()).reason).toBe("EXPIRED");

    fx.prisma.discountCode.findUnique.mockResolvedValue(
      mkCode({ maxUses: 3, usedCount: 3 }),
    );
    expect((await quote()).reason).toBe("EXHAUSTED");

    fx.prisma.discountCode.findUnique.mockResolvedValue(
      mkCode({ eventId: "evt-otro" }),
    );
    expect((await quote()).reason).toBe("SCOPE_MISMATCH");
    expect(fx.payments).toHaveLength(0);
  });

  it("percentOff válido → discountClp sobre la lista de preventa", async () => {
    fx.prisma.discountCode.findUnique.mockResolvedValue(
      mkCode({ percentOff: 50 }),
    );
    const res = await quote();
    expect(res).toEqual({ valid: true, discountClp: 5000 });
  });

  it("amountOff queda capeado en el precio de lista", async () => {
    fx.prisma.discountCode.findUnique.mockResolvedValue(
      mkCode({ amountOff: 15000 }),
    );
    const res = await quote();
    expect(res.discountClp).toBe(10000);
  });

  it("post-corte con doorPrice → el descuento se estima sobre el precio puerta", async () => {
    fx.prisma.event.findUnique.mockResolvedValue(
      mkEvent({
        // ayer → el cutoff de las 19:00 de ese día ya pasó; termina mañana
        startsAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
        endsAt: new Date(Date.now() + 60 * 60 * 1000),
        doorPrice: 8000,
      }),
    );
    fx.prisma.discountCode.findUnique.mockResolvedValue(
      mkCode({ percentOff: 25 }),
    );
    const res = await quote();
    expect(res.discountClp).toBe(2000); // 25% de 8000, no de 10000
  });

  it("evento terminado → valid pero discountClp 0 (el POST da su propio error)", async () => {
    fx.prisma.event.findUnique.mockResolvedValue(
      mkEvent({
        startsAt: new Date(Date.now() - 26 * 60 * 60 * 1000),
        endsAt: new Date(Date.now() - 60 * 60 * 1000),
      }),
    );
    fx.prisma.discountCode.findUnique.mockResolvedValue(
      mkCode({ percentOff: 50 }),
    );
    const res = await quote();
    expect(res).toEqual({ valid: true, discountClp: 0 });
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
      mkSettlement() as never,
      gw.registry,
      accountsStub as never,
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

  it("tasa: ProducerParams.platformFeePct gana al global (oferta por productor)", async () => {
    pf.producers.set("prod-1", {
      platformFeePct: 8,
    });
    const res = await buy();
    expect(res.quote.total).toBe(25000); // comprador paga la lista exacta
    const p = fx.payments[0]!;
    expect(p.feeMode).toBe("MANAGED");
    expect(p.platformFeeRate).toBe(8);
    expect(p.producerNetClp).toBe(25000 - Math.round(25000 * 0.08));
  });

  it("tasa: sin productor params cae a fees.managed_allin_pct (default 10)", async () => {
    const res = await buy();
    expect(res.quote.total).toBe(25000);
    const p = fx.payments[0]!;
    expect(p.feeMode).toBe("MANAGED");
    expect(p.platformFeeRate).toBe(10);
    expect(pf.params.getNumber).toHaveBeenCalledWith(
      "fees.managed_allin_pct",
      10,
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

describe("CheckoutService.membershipQuote", () => {
  // Revisión de orden del checkout de membresía - sin cobro: precio,
  // fee, total real, vigencia resultante y suscripción viva del plan.
  let fx: ReturnType<typeof mkPrisma>;
  let pf: ReturnType<typeof mkParams>;
  let svc: CheckoutService;

  const mkPlan = (over: Record<string, unknown> = {}) => ({
    id: "plan-1",
    name: "Mensual",
    active: true,
    type: "MONTHLY",
    price: 15000,
    classCount: null,
    periodDays: null,
    description: ["2 clases por semana"],
    academy: { id: "ac-1", name: "Academia X", active: true },
    ...over,
  });

  beforeEach(() => {
    fx = mkPrisma();
    pf = mkParams();
    const gw = mkGateway();
    svc = new CheckoutService(
      fx.prisma as unknown as PrismaService,
      gw.gateway,
      new PricingService(),
      pf.params as unknown as ParamsService,
      mkSettlement() as never,
      gw.registry,
      accountsStub as never,
    );
  });

  it("404: plan inexistente → PlanNotFoundError", async () => {
    fx.prisma.membershipPlan.findUnique.mockResolvedValue(null);
    await expect(svc.membershipQuote("p1", "plan-x")).rejects.toThrow(
      "plan no encontrado",
    );
  });

  it("400: plan inactivo no es cotizable", async () => {
    fx.prisma.membershipPlan.findUnique.mockResolvedValue(
      mkPlan({ active: false }),
    );
    await expect(svc.membershipQuote("p1", "plan-1")).rejects.toThrow(
      "este plan no está disponible para compra online",
    );
  });

  it("TRIAL activo con price > 0 → cotiza como compra única (recurring false)", async () => {
    fx.prisma.membershipPlan.findUnique.mockResolvedValue(
      mkPlan({ type: "TRIAL", price: 5000 }),
    );
    const q = await svc.membershipQuote("p1", "plan-1");
    expect(q.plan.type).toBe("TRIAL");
    expect(q.recurring).toBe(false);
    expect(q.totalClp).toBe(5000); // total = precio exacto del plan
    // sin periodDays configurado → la prueba queda sin fecha
    expect(q.vigenciaEndsAt).toBeNull();
  });

  it("TRIAL con price 0 → PlanNotPurchasableError (la gratis es asignación staff)", async () => {
    fx.prisma.membershipPlan.findUnique.mockResolvedValue(
      mkPlan({ type: "TRIAL", price: 0 }),
    );
    await expect(svc.membershipQuote("p1", "plan-1")).rejects.toBeInstanceOf(
      PlanNotPurchasableError,
    );
    await expect(svc.membershipQuote("p1", "plan-1")).rejects.toThrow(
      "la clase de prueba gratis la asigna la academia",
    );
  });

  it("MONTHLY: recurring, total = price exacto, vigencia = fin de mes", async () => {
    fx.prisma.membershipPlan.findUnique.mockResolvedValue(mkPlan());
    const q = await svc.membershipQuote("p1", "plan-1");
    expect(q.recurring).toBe(true);
    expect(q.totalClp).toBe(15000);
    expect(q.vigenciaEndsAt).not.toBeNull();
    expect(q.gateway).toBe("STUB");
    expect(q.subscription).toBeNull();
  });

  it("academia bloqueada por mora → AcademyUnavailableError (S3)", async () => {
    fx.prisma.membershipPlan.findUnique.mockResolvedValue(
      mkPlan({
        academy: { id: "ac-1", name: "Academia X", active: true, billingBlockedAt: new Date() },
      }),
    );
    const err = await svc
      .membershipQuote("p1", "plan-1")
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AcademyUnavailableError);
    expect((err as AcademyUnavailableError).code).toBe("academy.unavailable");
    expect((err as AcademyUnavailableError).message).toContain(
      "no está disponible",
    );
  });

  it("enrollment vigente → currentEndsAt y la vigencia extiende desde ahí", async () => {
    fx.prisma.membershipPlan.findUnique.mockResolvedValue(mkPlan());
    const endsAt = new Date(Date.now() + 10 * 86_400_000);
    fx.prisma.enrollment.findFirst.mockResolvedValue({ endsAt });
    const q = await svc.membershipQuote("p1", "plan-1");
    expect(q.currentEndsAt).toBe(endsAt.toISOString());
    // MONTHLY extiende al fin del mes de (endsAt + 1d) → debe ser
    // estrictamente posterior al endsAt vigente.
    expect(new Date(q.vigenciaEndsAt!).getTime()).toBeGreaterThan(
      endsAt.getTime(),
    );
  });

  it("CLASS_PACK: no recurrente, sin vigenciaEndsAt", async () => {
    fx.prisma.membershipPlan.findUnique.mockResolvedValue(
      mkPlan({ type: "CLASS_PACK", classCount: 8 }),
    );
    const q = await svc.membershipQuote("p1", "plan-1");
    expect(q.recurring).toBe(false);
    expect(q.vigenciaEndsAt).toBeNull();
  });

  it("devuelve la suscripción viva del plan si existe", async () => {
    fx.prisma.membershipPlan.findUnique.mockResolvedValue(mkPlan());
    const sub = { id: "sub-1", status: "ACTIVE", nextInvoiceAt: new Date() };
    fx.prisma.membershipSubscription.findFirst.mockResolvedValue(sub);
    const q = await svc.membershipQuote("p1", "plan-1");
    expect(q.subscription?.id).toBe("sub-1");
  });
});

describe("CheckoutService.purchaseMembership", () => {
  // Orden MEMBERSHIP one-off: valida plan+academia y crea el Payment
  // PENDING delegando el cobro. El Enrollment lo emite el webhook.
  // TRIAL se vende online solo con price > 0 (la gratis es staff).
  let fx: ReturnType<typeof mkPrisma>;
  let pf: ReturnType<typeof mkParams>;
  let gw: ReturnType<typeof mkGateway>;
  let svc: CheckoutService;

  const mkPlan = (over: Record<string, unknown> = {}) => ({
    id: "plan-1",
    active: true,
    type: "MONTHLY",
    price: 15000,
    academy: { active: true },
    ...over,
  });

  beforeEach(() => {
    fx = mkPrisma();
    pf = mkParams();
    gw = mkGateway();
    fx.prisma.membershipPlan.findUnique.mockResolvedValue(mkPlan());
    svc = new CheckoutService(
      fx.prisma as unknown as PrismaService,
      gw.gateway,
      new PricingService(),
      pf.params as unknown as ParamsService,
      mkSettlement() as never,
      gw.registry,
      accountsStub as never,
    );
  });

  const buy = (planId = "plan-1") =>
    svc.purchaseMembership("per-1", { planId });

  it("plan inexistente o academia inactiva → PlanNotFoundError", async () => {
    fx.prisma.membershipPlan.findUnique.mockResolvedValue(null);
    await expect(buy()).rejects.toBeInstanceOf(PlanNotFoundError);
    fx.prisma.membershipPlan.findUnique.mockResolvedValue(
      mkPlan({ academy: { active: false } }),
    );
    await expect(buy()).rejects.toBeInstanceOf(PlanNotFoundError);
    expect(fx.payments).toHaveLength(0);
  });

  it("plan inactivo → PlanNotPurchasableError", async () => {
    fx.prisma.membershipPlan.findUnique.mockResolvedValue(
      mkPlan({ active: false }),
    );
    await expect(buy()).rejects.toBeInstanceOf(PlanNotPurchasableError);
    expect(fx.payments).toHaveLength(0);
  });

  it("academia bloqueada por mora → AcademyUnavailableError, sin orden (S3)", async () => {
    fx.prisma.membershipPlan.findUnique.mockResolvedValue(
      mkPlan({
        academy: { active: true, billingBlockedAt: new Date() },
      }),
    );
    await expect(buy()).rejects.toBeInstanceOf(AcademyUnavailableError);
    expect(fx.payments).toHaveLength(0);
    expect(gw.createOrder).not.toHaveBeenCalled();
  });

  it("MONTHLY → Payment MEMBERSHIP PENDING con refId mem_<planId>_", async () => {
    const res = await buy();
    const p = fx.payments[0]!;
    expect(p.orderType).toBe("MEMBERSHIP");
    expect(p.feeMode).toBe("ACADEMY"); // SaaS: sin comisión, solo pasarela
    expect(p.amount).toBe(15000); // total = precio exacto del plan
    expect(p.amount).toBe(res.quote.total);
    expect((p.refId as string).startsWith("mem_plan-1_")).toBe(true);
    expect(gw.createOrder).toHaveBeenCalledOnce();
  });

  it("TRIAL con price > 0 vende a persona sin inscripción (compra única)", async () => {
    fx.prisma.membershipPlan.findUnique.mockResolvedValue(
      mkPlan({ type: "TRIAL", price: 5000 }),
    );
    const res = await buy();
    const p = fx.payments[0]!;
    expect(p.orderType).toBe("MEMBERSHIP");
    expect(res.quote.listPrice).toBe(5000);
    expect(res.quote.total).toBe(5000); // precio exacto (modelo SaaS)
    expect(res.paymentUrl).toContain("pay.example");
  });

  it("TRIAL con price > 0 también vende a alumna con enrollment ACTIVE previo", async () => {
    fx.prisma.membershipPlan.findUnique.mockResolvedValue(
      mkPlan({ type: "TRIAL", price: 5000 }),
    );
    // la compra no valida enrollment - la alumna inscrita también puede
    // comprar la prueba (el settle crea una fila TRIAL aparte).
    fx.prisma.enrollment.findFirst.mockResolvedValue({
      endsAt: new Date(Date.now() + 30 * 86_400_000),
    });
    const res = await buy();
    expect(res.quote.total).toBe(5000); // precio exacto (modelo SaaS)
    expect(fx.payments).toHaveLength(1);
  });

  it("TRIAL con price 0 → PlanNotPurchasableError (la gratis es asignación staff)", async () => {
    fx.prisma.membershipPlan.findUnique.mockResolvedValue(
      mkPlan({ type: "TRIAL", price: 0 }),
    );
    await expect(buy()).rejects.toBeInstanceOf(PlanNotPurchasableError);
    await expect(buy()).rejects.toThrow(
      "la clase de prueba gratis la asigna la academia",
    );
    expect(fx.payments).toHaveLength(0);
    expect(gw.createOrder).not.toHaveBeenCalled();
  });

  it("TRIAL inactivo → PlanNotPurchasableError", async () => {
    fx.prisma.membershipPlan.findUnique.mockResolvedValue(
      mkPlan({ type: "TRIAL", price: 5000, active: false }),
    );
    await expect(buy()).rejects.toBeInstanceOf(PlanNotPurchasableError);
    expect(fx.payments).toHaveLength(0);
  });
});

describe("CheckoutService.purchaseClass / classQuote", () => {
  // Clase suelta / taller pago: orden WORKSHOP con refId wks_<classId>_.
  let fx: ReturnType<typeof mkPrisma>;
  let pf: ReturnType<typeof mkParams>;
  let gw: ReturnType<typeof mkGateway>;
  let svc: CheckoutService;

  // Clase futura con dropInPrice - slot con cadena de capacidad completa.
  const mkClass = (over: Record<string, unknown> = {}) => ({
    id: "cls-1",
    date: new Date(Date.now() + 24 * 60 * 60 * 1000), // mañana
    cancelled: false,
    capacity: null,
    slot: {
      startTime: "20:00",
      capacity: 10,
      academyId: "ac-1",
      series: {
        id: "ser-1",
        name: "Taller de Shines",
        dropInPrice: 9000,
        quorum: null,
      },
      academy: { defaultQuorum: null, billingBlockedAt: null },
    },
    ...over,
  });

  beforeEach(() => {
    fx = mkPrisma();
    pf = mkParams();
    gw = mkGateway();
    fx.prisma.class.findUnique.mockResolvedValue(mkClass());
    svc = new CheckoutService(
      fx.prisma as unknown as PrismaService,
      gw.gateway,
      new PricingService(),
      pf.params as unknown as ParamsService,
      mkSettlement() as never,
      gw.registry,
      accountsStub as never,
    );
  });

  const buy = () => svc.purchaseClass("per-1", { classId: "cls-1" });

  it("clase inexistente → error 404 de dominio", async () => {
    fx.prisma.class.findUnique.mockResolvedValue(null);
    await expect(buy()).rejects.toThrow("clase no encontrada");
  });

  it("clase cancelada o sin dropInPrice → no vendible", async () => {
    fx.prisma.class.findUnique.mockResolvedValue(
      mkClass({ cancelled: true }),
    );
    await expect(buy()).rejects.toThrow("clase no disponible");

    const noPrice = mkClass();
    (noPrice.slot.series as Record<string, unknown>).dropInPrice = null;
    fx.prisma.class.findUnique.mockResolvedValue(noPrice);
    await expect(buy()).rejects.toThrow("clase no disponible");
  });

  it("clase ya iniciada → no vendible", async () => {
    // date = medianoche UTC de hoy + startTime 00:00 → ya pasó.
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    fx.prisma.class.findUnique.mockResolvedValue(
      mkClass({
        date: today,
        slot: {
          ...mkClass().slot,
          startTime: "00:00",
        },
      }),
    );
    await expect(buy()).rejects.toThrow("clase no disponible");
  });

  it("academia bloqueada por mora → AcademyUnavailableError en quote y compra (S3)", async () => {
    const cls = mkClass();
    (cls.slot.academy as Record<string, unknown>).billingBlockedAt =
      new Date();
    fx.prisma.class.findUnique.mockResolvedValue(cls);
    await expect(buy()).rejects.toBeInstanceOf(AcademyUnavailableError);
    await expect(svc.classQuote("per-1", "cls-1")).rejects.toBeInstanceOf(
      AcademyUnavailableError,
    );
    expect(fx.payments).toHaveLength(0);
    expect(gw.createOrder).not.toHaveBeenCalled();
  });

  it("cupo agotado → 409", async () => {
    fx.prisma.classBooking.count.mockResolvedValue(10); // capacity 10
    await expect(buy()).rejects.toThrow("cupo agotado");
    expect(fx.payments).toHaveLength(0);
  });

  it("viewer ya reservó esa clase → 409", async () => {
    fx.prisma.classBooking.findFirst.mockResolvedValue({
      id: "bk-1",
      status: "BOOKED",
    });
    await expect(buy()).rejects.toThrow("ya tienes una reserva");
    expect(fx.payments).toHaveLength(0);
  });

  it("crea Payment WORKSHOP: refId wks_, precio exacto y feeMode ACADEMY", async () => {
    const res = await buy();
    const p = fx.payments[0];
    expect(p.orderType).toBe("WORKSHOP");
    expect(p.feeMode).toBe("ACADEMY");
    expect(p.quantity).toBe(1);
    expect(p.unitListPrice).toBe(9000);
    expect(p.unitServiceFee).toBe(0);
    expect(p.amount).toBe(9000);
    expect(p.amount).toBe(res.quote.total);
    expect(res.quote.listPrice).toBe(9000);
    expect(res.paymentUrl).toContain("pay.example");
    const ref = decodeClassRef(p.refId as string);
    expect(ref?.classId).toBe("cls-1");
  });

  it("classQuote: precio exacto + spotsLeft + alreadyBooked sin crear orden", async () => {
    fx.prisma.classBooking.count.mockResolvedValue(3);
    const q = await svc.classQuote("per-1", "cls-1");
    expect(q.listPrice).toBe(9000);
    expect(q.total).toBe(9000);
    expect(q.spotsLeft).toBe(7);
    expect(q.alreadyBooked).toBe(false);
    expect(fx.payments).toHaveLength(0);
  });
});

describe("CheckoutService private-class (clase particular comprable)", () => {
  let fx: ReturnType<typeof mkPrisma>;
  let pf: ReturnType<typeof mkParams>;
  let gw: ReturnType<typeof mkGateway>;
  let svc: CheckoutService;

  const mkAcademy = (over: Record<string, unknown> = {}) => ({
    id: "ac-1",
    name: "Mambo Madness",
    active: true,
    privateLessonPrice: 40000,
    billingBlockedAt: null,
    ...over,
  });

  beforeEach(() => {
    fx = mkPrisma();
    pf = mkParams();
    gw = mkGateway();
    fx.prisma.academy.findUnique.mockResolvedValue(mkAcademy());
    svc = new CheckoutService(
      fx.prisma as unknown as PrismaService,
      gw.gateway,
      new PricingService(),
      pf.params as unknown as ParamsService,
      mkSettlement() as never,
      gw.registry,
      accountsStub as never,
    );
  });

  it("quote: precio exacto, sin crear orden", async () => {
    const q = await svc.privateClassQuote("per-1", "ac-1");
    expect(q.listPrice).toBe(40000);
    expect(q.total).toBe(40000);
    expect(q.academy).toMatchObject({ id: "ac-1", name: "Mambo Madness" });
    expect(fx.payments).toHaveLength(0);
    expect(gw.createOrder).not.toHaveBeenCalled();
  });

  it("academia inexistente → AcademyNotFoundError", async () => {
    fx.prisma.academy.findUnique.mockResolvedValue(null);
    await expect(
      svc.purchasePrivateClass("per-1", { academyId: "nope" }),
    ).rejects.toBeInstanceOf(AcademyNotFoundError);
  });

  it("academia inactiva o sin privateLessonPrice → PrivateClassNotPurchasableError", async () => {
    fx.prisma.academy.findUnique.mockResolvedValue(
      mkAcademy({ active: false }),
    );
    await expect(
      svc.purchasePrivateClass("per-1", { academyId: "ac-1" }),
    ).rejects.toBeInstanceOf(PrivateClassNotPurchasableError);
    fx.prisma.academy.findUnique.mockResolvedValue(
      mkAcademy({ privateLessonPrice: null }),
    );
    await expect(
      svc.purchasePrivateClass("per-1", { academyId: "ac-1" }),
    ).rejects.toBeInstanceOf(PrivateClassNotPurchasableError);
    fx.prisma.academy.findUnique.mockResolvedValue(
      mkAcademy({ privateLessonPrice: 0 }),
    );
    await expect(
      svc.privateClassQuote("per-1", "ac-1"),
    ).rejects.toBeInstanceOf(PrivateClassNotPurchasableError);
    expect(fx.payments).toHaveLength(0);
  });

  it("academia bloqueada por mora → AcademyUnavailableError en quote y compra (S3)", async () => {
    fx.prisma.academy.findUnique.mockResolvedValue(
      mkAcademy({ billingBlockedAt: new Date() }),
    );
    await expect(
      svc.purchasePrivateClass("per-1", { academyId: "ac-1" }),
    ).rejects.toBeInstanceOf(AcademyUnavailableError);
    await expect(
      svc.privateClassQuote("per-1", "ac-1"),
    ).rejects.toBeInstanceOf(AcademyUnavailableError);
    expect(fx.payments).toHaveLength(0);
    expect(gw.createOrder).not.toHaveBeenCalled();
  });

  it("crea Payment PRIVATE: refId pvt_<academyId>_, precio exacto, feeMode ACADEMY", async () => {
    const res = await svc.purchasePrivateClass("per-1", {
      academyId: "ac-1",
    });
    const p = fx.payments[0]!;
    expect(p.orderType).toBe("PRIVATE");
    expect(p.feeMode).toBe("ACADEMY");
    expect(p.unitListPrice).toBe(40000);
    expect(p.unitServiceFee).toBe(0);
    expect(p.amount).toBe(40000);
    expect(p.quantity).toBe(1);
    expect(res.paymentUrl).toContain("pay.example");
    expect(gw.createOrder).toHaveBeenCalledOnce();
    expect(decodePrivateRef(p.refId as string)?.academyId).toBe("ac-1");
  });
});
