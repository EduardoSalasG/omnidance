import { describe, it, expect, beforeEach } from "vitest";
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import type { Request } from "express";
import type { PrismaService } from "../../prisma.service";
import type { ParamsService } from "../../params/params.service";
import type { ProducerFeeDefaults } from "../../params/params.service";
// Ciclo session.guard ⇄ auth.controller (SESSION_COOKIE): si session.guard
// entra primero, los @UseGuards de auth.controller evalúan con SessionGuard
// undefined. Cargar auth.controller antes rompe el ciclo a favor del test.
import "../../auth/infrastructure/auth.controller";
import { AdminPayoutsController } from "./payouts.controller";
import { encodePrivateRef, encodeSeriesPassRef } from "../domain/order-ref";
import { managedFeeBreakdown } from "../../common/fee-breakdown";

// AdminPayoutsController.generate → computeSettlement (producer-fee-model):
// la liquidación se arma por PayoutLine auditables - cada deducción rastrea
// a la orden que la generó.
// - MANAGED: gross += amount; deducción = amount − producerNetClp (all-in%
//   congelado) descompuesta en GATEWAY_FEE_PASSTHROUGH (costo real si la
//   pasarela lo reportó, si no el esperado) + PLATFORM_FEE_NET + _VAT.
// - OWN_METHOD/OWN_GATEWAY: la plata nunca pasó por nosotros → NO suma al
//   gross; su comisión devengada se netea (líneas OWN_METHOD_*).
// - FREE: no devenga nada. MANUAL legacy sin feeMode: no suma al gross.
// - feeMode null (legacy): regla vieja (Σ fee real + platformFeePct).
// - ACADEMY (SaaS): gross − GATEWAY_FEE_PASSTHROUGH por pago (real si lo
//   reportó la pasarela, si no amount × gateway_fee.academy_passthrough_pct).
// PrismaService se simula in-memory con matching mínimo de `where`.

type Row = Record<string, unknown>;

function matchWhere(row: Row, where: Row): boolean {
  for (const [key, cond] of Object.entries(where)) {
    const v = row[key];
    if (cond instanceof Date) {
      if (!(v instanceof Date) || v.getTime() !== cond.getTime()) return false;
      continue;
    }
    if (cond !== null && typeof cond === "object") {
      const c = cond as Row;
      if ("in" in c && !(c.in as unknown[]).includes(v)) return false;
      if ("not" in c && v === c.not) return false;
      if ("gte" in c && (!(v instanceof Date) || v < (c.gte as Date)))
        return false;
      if ("lte" in c && (!(v instanceof Date) || v > (c.lte as Date)))
        return false;
      // Objeto anidado sin operador (p.ej. slot: { academyId }) →
      // matcheo recursivo sobre la relación materializada del fake.
      if (
        !("in" in c) &&
        !("not" in c) &&
        !("gte" in c) &&
        !("lte" in c) &&
        v !== null &&
        typeof v === "object" &&
        !(v instanceof Date) &&
        !matchWhere(v as Row, c)
      )
        return false;
      continue;
    }
    if (v !== cond) return false;
  }
  return true;
}

interface FakePayment {
  id: string;
  orderType: "TICKET" | "SERIES_PASS" | "MEMBERSHIP" | "WORKSHOP" | "PRIVATE";
  status: "PENDING" | "PAID" | "FAILED";
  eventId: string | null;
  refId: string;
  amount: number;
  fee: number;
  createdAt: Date;
  gateway?: string;
  gatewayFeeClp?: number | null;
  feeMode?: string | null;
  platformFeeRate?: number | null;
  platformFeeNetClp?: number | null;
  platformFeeVatClp?: number | null;
  gatewayFeeExpected?: number | null;
  producerNetClp?: number | null;
}

interface FakePayout {
  id: string;
  actorType: string;
  actorId: string;
  periodStart: Date;
  periodEnd: Date;
  gross: number;
  platformFee: number;
  /** Línea GATEWAY_FEE_PASSTHROUGH - solo payouts ACADEMY (modelo SaaS). */
  gatewayFee: number;
  net: number;
  status: string;
  paidAt: Date | null;
  evidenceUrl: string | null;
  createdAt: Date;
}

class FakePrisma {
  events: Row[] = [];
  series: Row[] = [];
  membershipPlans: Row[] = [];
  privateLessons: Row[] = [];
  payments: FakePayment[] = [];
  payouts: FakePayout[] = [];
  payoutLines: Row[] = [];
  paymentEvents: Row[] = [];
  auditLogs: Row[] = [];
  private seq = 0;

  $transaction = async (fn: (tx: unknown) => Promise<unknown>) => fn(this);
  $executeRaw = async () => 0;

  payoutLine = {
    createMany: async ({ data }: { data: Row[] }) => {
      this.payoutLines.push(...data);
      return { count: data.length };
    },
    findMany: async ({ where }: { where: Row }) =>
      this.payoutLines.filter((l) => matchWhere(l, where)),
  };

  paymentEvent = {
    findFirst: async () => null,
    create: async ({ data }: { data: Row }) => {
      this.paymentEvents.push(data);
      return data;
    },
  };

  event = {
    findMany: async ({ where }: { where: Row }) =>
      this.events.filter((e) => matchWhere(e, where)),
  };

  eventSeries = {
    findMany: async ({ where }: { where: Row }) =>
      this.series.filter((s) => matchWhere(s, where)),
  };

  membershipPlan = {
    findMany: async ({ where }: { where: Row }) =>
      this.membershipPlans.filter((p) => matchWhere(p, where)),
  };

  classes: Row[] = [];
  class = {
    // ACADEMY WORKSHOP: clase → slot.academyId (misma derivación que el
    // refId wks_).
    findMany: async ({ where }: { where: Row }) =>
      this.classes.filter((c) => matchWhere(c, where)),
  };

  // PRIVATE cancelada no devenga - el controller consulta la lección por
  // paymentId y excluye status CANCELLED.
  privateLesson = {
    findMany: async ({ where }: { where: Row }) =>
      this.privateLessons.filter((l) => matchWhere(l, where)),
  };

  payment = {
    findMany: async ({ where }: { where: Row }) =>
      this.payments.filter((p) => matchWhere(p as unknown as Row, where)),
  };

  private attachLines(payout: FakePayout, args: { include?: { lines?: boolean } }) {
    return args.include?.lines
      ? {
          ...payout,
          lines: this.payoutLines.filter((l) => l.payoutId === payout.id),
        }
      : payout;
  }

  payout = {
    findFirst: async (args: { where: Row; include?: { lines?: boolean } }) => {
      const found = this.payouts.find((p) =>
        matchWhere(p as unknown as Row, args.where),
      );
      return found ? this.attachLines(found, args) : null;
    },
    findUnique: async ({ where }: { where: { id: string } }) =>
      this.payouts.find((p) => p.id === where.id) ?? null,
    findUniqueOrThrow: async (args: {
      where: { id: string };
      include?: { lines?: boolean };
    }) => {
      const found = this.payouts.find((p) => p.id === args.where.id);
      if (!found) throw new Error("payout no encontrado");
      return this.attachLines(found, args);
    },
    findMany: async (args?: { where?: Row; include?: { lines?: boolean } }) =>
      this.payouts
        .filter((p) => !args?.where || matchWhere(p as unknown as Row, args.where))
        .map((p) => this.attachLines(p, args ?? {})),
    create: async ({
      data,
    }: {
      data: Pick<
        FakePayout,
        | "actorType"
        | "actorId"
        | "periodStart"
        | "periodEnd"
        | "gross"
        | "platformFee"
        | "gatewayFee"
        | "net"
      >;
    }) => {
      const row: FakePayout = {
        id: `po-${++this.seq}`,
        status: "PENDING",
        paidAt: null,
        evidenceUrl: null,
        createdAt: new Date(),
        ...data,
      };
      this.payouts.push(row);
      return row;
    },
    update: async ({
      where,
      data,
    }: {
      where: { id: string };
      data: Partial<FakePayout>;
    }) => {
      const row = this.payouts.find((p) => p.id === where.id);
      if (!row) throw new Error("payout no encontrado");
      Object.assign(row, data);
      return row;
    },
  };

  auditLog = {
    create: async ({ data }: { data: Row }) => {
      this.auditLogs.push(data);
      return data;
    },
  };
}

function mkParams() {
  const numbers = new Map<string, number>();
  const producers = new Map<string, ProducerFeeDefaults>();
  const params = {
    getNumber: async (key: string, fallback: number) =>
      numbers.get(key) ?? fallback,
    getProducerParams: async (producerId: string | null | undefined) =>
      producerId ? (producers.get(producerId) ?? null) : null,
  };
  return { params, numbers, producers };
}

const adminReq = { person: { id: "admin-1" } } as unknown as Request;

const IN_PERIOD = new Date("2025-11-15T12:00:00Z");
const DTO = {
  periodStart: "2025-11-01T00:00:00Z",
  periodEnd: "2025-11-30T23:59:59Z",
};

let paymentSeq = 0;
const mkPayment = (over: Partial<FakePayment>): FakePayment => ({
  id: `pay-${++paymentSeq}`,
  orderType: "TICKET",
  status: "PAID",
  eventId: null,
  refId: "tkt_x__u",
  amount: 10000,
  fee: 0,
  gateway: "FLOW",
  createdAt: IN_PERIOD,
  ...over,
});

// Pago del modelo nuevo: desglose congelado al crear la orden (mismo
// helper de producción - la liquidación solo lee, nunca recalcula).
const mkManaged = (over: Partial<FakePayment> = {}): FakePayment => {
  const amount = over.amount ?? 10000;
  const rate = over.platformFeeRate ?? 10;
  const b = managedFeeBreakdown(amount, rate, 3.19, 19);
  return mkPayment({ gateway: "FLOW", ...b, ...over });
};

describe("AdminPayoutsController.generate - computeSettlement", () => {
  let prisma: FakePrisma;
  let pf: ReturnType<typeof mkParams>;
  let ctrl: AdminPayoutsController;

  beforeEach(() => {
    prisma = new FakePrisma();
    pf = mkParams();
    ctrl = new AdminPayoutsController(
      prisma as unknown as PrismaService,
      pf.params as unknown as ParamsService,
    );

    prisma.events.push(
      { id: "evt-p1", producerId: "prod-1", platformFeePct: 10 },
      { id: "evt-p2", producerId: "prod-1", platformFeePct: null },
      { id: "evt-other", producerId: "prod-2", platformFeePct: null },
      {
        id: "evt-acad",
        academyId: "ac-1",
        producerId: null,
        platformFeePct: 20,
      },
      {
        id: "evt-acad-p",
        academyId: "ac-1",
        producerId: "prod-9",
        platformFeePct: null,
      },
      { id: "evt-venue", venueId: "ven-1", producerId: null, platformFeePct: null },
    );
    prisma.series.push({ id: "ser-p1", producerId: "prod-1" });

    prisma.payments.push(
      // evt-p1 al 10% (snapshot); la pasarela reportó costo real 325
      // (vs esperado 319) - la deducción del productor se mantiene y la
      // reconciliación ajusta el split interno pasarela/fee nuestro.
      mkManaged({
        eventId: "evt-p1",
        amount: 10000,
        platformFeeRate: 10,
        gatewayFeeClp: 325,
      }),
      // evt-p2 a la promo del productor (8% congelado).
      mkManaged({ eventId: "evt-p2", amount: 5000, platformFeeRate: 8 }),
      mkManaged({ eventId: "evt-other", amount: 7777 }),
      mkManaged({
        orderType: "SERIES_PASS",
        refId: encodeSeriesPassRef("ser-p1", "2025-11"),
        amount: 25000,
        platformFeeRate: 8,
      }),
      mkManaged({
        orderType: "SERIES_PASS",
        refId: encodeSeriesPassRef("ser-ajena", "2025-11"),
        amount: 25000,
      }),
      // Venta por métodos propios del productor: la plata no pasó por la
      // pasarela → no suma al gross; su comisión se netea (OWN_METHOD).
      mkManaged({
        eventId: "evt-p1",
        amount: 20000,
        gateway: "MANUAL",
        feeMode: "OWN_METHOD",
        platformFeeRate: 6.81,
        platformFeeNetClp: 1144,
        platformFeeVatClp: 218,
        gatewayFeeExpected: 0,
        producerNetClp: 20000 - 1362,
      }),
      // Entrada liberada: no devenga nada.
      mkManaged({
        eventId: "evt-p1",
        amount: 0,
        feeMode: "FREE",
        platformFeeRate: null,
        platformFeeNetClp: 0,
        platformFeeVatClp: 0,
        gatewayFeeExpected: 0,
        producerNetClp: 0,
      }),
      mkManaged({ eventId: "evt-p1", status: "FAILED", amount: 10000 }),
      mkManaged({
        eventId: "evt-p1",
        amount: 10000,
        createdAt: new Date("2025-10-01T00:00:00Z"),
      }),
      // Legacy (pre-modelo, feeMode null): regla vieja Σ fee + pct.
      mkPayment({ eventId: "evt-p1", amount: 7000, fee: 300 }),
      // Orden de academia: solo pasarela (real 200 reportado).
      mkManaged({
        eventId: "evt-acad",
        amount: 8000,
        feeMode: "ACADEMY",
        platformFeeRate: null,
        platformFeeNetClp: 0,
        platformFeeVatClp: 0,
        gatewayFeeExpected: null,
        producerNetClp: null,
        gatewayFeeClp: 200,
      }),
      mkManaged({ eventId: "evt-acad-p", amount: 9000 }),
      mkPayment({ eventId: "evt-venue", amount: 4000, fee: 50 }),
      // PRIVATE (clase particular comprable): refId pvt_<academyId>_ - se
      // atribuye a la academia aunque no tenga eventos/planes/clases.
      // Sin costo real reportado → passthrough estimado por param.
      mkManaged({
        orderType: "PRIVATE",
        refId: encodePrivateRef("ac-1"),
        amount: 25000,
        feeMode: "ACADEMY",
        platformFeeRate: null,
        platformFeeNetClp: 0,
        platformFeeVatClp: 0,
        gatewayFeeExpected: null,
        producerNetClp: null,
      }),
      mkManaged({
        orderType: "PRIVATE",
        refId: encodePrivateRef("ac-ajena"),
        amount: 30000,
        feeMode: "ACADEMY",
        platformFeeRate: null,
      }),
    );
  });

  it("PRODUCER: gross solo cuenta lo cobrado por la pasarela; excluye ajenos/no-PAID/fuera de período/OWN_METHOD", async () => {
    const payout = await ctrl.generate(
      { actorType: "PRODUCER", actorId: "prod-1", ...DTO },
      adminReq,
    );
    // 10000 (evt-p1) + 5000 (evt-p2) + 25000 (ser-p1) + 7000 (legacy).
    // NO cuenta: evt-other, ser-ajena, FAILED, octubre, OWN_METHOD
    // (20000 - la plata nunca pasó por la pasarela) ni FREE.
    expect(payout.gross).toBe(47000);
  });

  it("PRODUCER: deducción por snapshot congelado, descompuesta en líneas auditables por orden", async () => {
    const payout = await ctrl.generate(
      { actorType: "PRODUCER", actorId: "prod-1", ...DTO },
      adminReq,
    );
    // Deducciones MANAGED: 1000 (10% de 10000) + 400 (8% de 5000) +
    // 2000 (8% de 25000). Pasarela real 325/estimada 160/798; legacy
    // 300 + 700 (10% de 7000 por pct del evento). OWN_METHOD netea 1362.
    expect(payout.gatewayFee).toBe(325 + 160 + 798 + 300);
    // platformFee = (neto+IVA de cada orden) + legacy pct + own netting
    expect(payout.platformFee).toBe(675 + 240 + 1202 + 700 + 1144 + 218);
    expect(payout.net).toBe(
      47000 - (325 + 160 + 798 + 300) - (675 + 240 + 1202 + 700 + 1144 + 218),
    );
    // Cada deducción rastrea a la orden: 3 líneas por orden MANAGED,
    // 2 por own-method, 2 por el pago legacy.
    expect(prisma.payoutLines).toHaveLength(3 + 3 + 3 + 2 + 2);
    const gw = prisma.payoutLines.find(
      (l) => l.type === "GATEWAY_FEE_PASSTHROUGH" && l.amount === 325,
    );
    expect(gw?.paymentId).toBeDefined();
  });

  it("PRODUCER: el costo real de pasarela reemplaza al esperado sin tocar la deducción del productor", async () => {
    const payout = await ctrl.generate(
      { actorType: "PRODUCER", actorId: "prod-1", ...DTO },
      adminReq,
    );
    // evt-p1: la pasarela cobró 325 real (vs 319 esperado). El productor
    // sigue descontando su all-in congelado (1000): la diferencia la
    // absorbe el split interno neto/IVA nuestro, no el productor.
    const linesP1 = prisma.payoutLines.filter(
      (l) =>
        (l.meta as { orderAmount?: number } | undefined)?.orderAmount === 10000,
    );
    const gwLine = linesP1.find((l) => l.type === "GATEWAY_FEE_PASSTHROUGH")!;
    expect(gwLine.amount).toBe(325);
    const deduccionP1 = linesP1
      .filter((l) => l.type !== "MANUAL_ADJUSTMENT")
      .reduce((s, l) => s + (l.amount as number), 0);
    expect(deduccionP1).toBe(1000); // all-in congelado: 10% de 10000
    expect(payout.net).toBeDefined();
  });

  it("PRODUCER: tasa 0% (override promo) liquida sin deducción - la pasarela la absorbe la plataforma", async () => {
    prisma.payments.push(
      mkManaged({ eventId: "evt-p1", amount: 6000, platformFeeRate: 0 }),
    );
    const payout = await ctrl.generate(
      { actorType: "PRODUCER", actorId: "prod-1", ...DTO },
      adminReq,
    );
    // gross +6000 sin líneas: el gatewayFeeExpected (319) no se traspasa -
    // all-in 0% significa que el productor paga nada, ni siquiera la pasarela.
    const promo = prisma.payments[prisma.payments.length - 1];
    expect(
      prisma.payoutLines.filter((l) => l.paymentId === promo.id),
    ).toHaveLength(0);
    expect(payout.gross).toBe(47000 + 6000);
    expect(payout.net).toBe(
      payout.gross - payout.platformFee - payout.gatewayFee,
    );
  });

  it("PRODUCER: métodos propios netean su comisión sin inflar el gross (OWN_METHOD)", async () => {
    const payout = await ctrl.generate(
      { actorType: "PRODUCER", actorId: "prod-1", ...DTO },
      adminReq,
    );
    const own = prisma.payoutLines.filter((l) =>
      (l.type as string).startsWith("OWN_METHOD_"),
    );
    expect(own).toHaveLength(2);
    expect(own.map((l) => l.type).sort()).toEqual([
      "OWN_METHOD_FEE_NET",
      "OWN_METHOD_FEE_VAT",
    ]);
    expect(own.reduce((s, l) => s + (l.amount as number), 0)).toBe(1362);
    // Los 20000 de la venta propia jamás entraron al gross ni al neto.
    expect(payout.gross).toBe(47000);
  });

  it("PRODUCER: pago legacy (feeMode null) liquida con la regla vieja (fee real + pct del evento)", async () => {
    const payout = await ctrl.generate(
      { actorType: "PRODUCER", actorId: "prod-1", ...DTO },
      adminReq,
    );
    const legacy = prisma.payoutLines.filter(
      (l) => (l.meta as { legacy?: boolean } | undefined)?.legacy === true,
    );
    // 7000 a evt-p1 (pct 10): fee real 300 + comisión 700.
    expect(legacy.map((l) => [l.type, l.amount])).toEqual(
      expect.arrayContaining([
        ["GATEWAY_FEE_PASSTHROUGH", 300],
        ["PLATFORM_FEE_NET", 700],
      ]),
    );
    expect(payout.gross).toBe(47000);
  });

  it("PRODUCER: cada pago con deducción emite PAYOUT_LINE_ASSIGNED en su ledger", async () => {
    await ctrl.generate(
      { actorType: "PRODUCER", actorId: "prod-1", ...DTO },
      adminReq,
    );
    const assigned = prisma.paymentEvents.filter(
      (e) => e.type === "PAYOUT_LINE_ASSIGNED",
    );
    // 3 órdenes MANAGED + 1 OWN_METHOD + 1 legacy (FREE no devenga).
    expect(assigned).toHaveLength(5);
    expect(
      (assigned[0]!.payload as Record<string, unknown>).payoutId,
    ).toBeDefined();
  });

  it("PRODUCER: el pago queda auditado (PAYOUT_GENERATE) y nace PENDING", async () => {
    const payout = await ctrl.generate(
      { actorType: "PRODUCER", actorId: "prod-1", ...DTO },
      adminReq,
    );
    expect(payout.status).toBe("PENDING");
    expect(prisma.auditLogs).toHaveLength(1);
    expect(prisma.auditLogs[0]).toMatchObject({
      actorId: "admin-1",
      action: "PAYOUT_GENERATE",
      targetType: "Payout",
      targetId: payout.id,
    });
  });

  it("idempotente: segundo generate devuelve el existente con sus líneas, sin auditar", async () => {
    const first = await ctrl.generate(
      { actorType: "PRODUCER", actorId: "prod-1", ...DTO },
      adminReq,
    );
    const second = await ctrl.generate(
      { actorType: "PRODUCER", actorId: "prod-1", ...DTO },
      adminReq,
    );
    expect(second.id).toBe(first.id);
    expect(prisma.payouts).toHaveLength(1);
    expect(prisma.auditLogs).toHaveLength(1);
    expect(second.lines.length).toBeGreaterThan(0);
  });

  it("ACADEMY (modelo SaaS): pasarela al costo real por orden, estimada si no hay reporte; nunca platformFee", async () => {
    const payout = await ctrl.generate(
      { actorType: "ACADEMY", actorId: "ac-1", ...DTO },
      adminReq,
    );
    // evt-acad (8000) sí; evt-acad-p (9000) tiene productor → no devenga
    // aquí; el PRIVATE de ac-1 (25000) sí entra por refId, el de ac-ajena no.
    expect(payout.gross).toBe(33000);
    // Costo real reportado en evt-acad (200) + estimado en el PRIVATE
    // (round(25000 × 3.19%) = 798). La academia paga su suscripción, no
    // comisión por venta - platformFee siempre 0.
    expect(payout.platformFee).toBe(0);
    expect(payout.gatewayFee).toBe(998);
    expect(payout.net).toBe(33000 - 998);
    // Una línea por orden - nunca un monto agregado escondido.
    expect(payout.lines.map((l) => [l.type, l.amount])).toEqual(
      expect.arrayContaining([
        ["GATEWAY_FEE_PASSTHROUGH", 200],
        ["GATEWAY_FEE_PASSTHROUGH", 798],
      ]),
    );
  });

  it("ACADEMY sin eventos/clases/planes igual liquida su PRIVATE (refId pvt_)", async () => {
    pf.numbers.set("platform_fee.default_pct", 10); // inerte para ACADEMY
    const payout = await ctrl.generate(
      { actorType: "ACADEMY", actorId: "ac-ajena", ...DTO },
      adminReq,
    );
    // ac-ajena no tiene eventos ni clases - solo el pago PRIVATE de 30000.
    expect(payout.gross).toBe(30000);
    expect(payout.platformFee).toBe(0); // platform_fee.default_pct no aplica
    expect(payout.gatewayFee).toBe(957); // round(30000 × 3.19%)
    expect(payout.net).toBe(29043);
  });

  it("ACADEMY: particular cancelada no devenga (el owner debe devolver el pago)", async () => {
    const cancelled = prisma.payments.find(
      (p) => p.orderType === "PRIVATE" && p.refId.includes("ac-ajena"),
    )!;
    prisma.privateLessons.push({
      paymentId: cancelled.id,
      status: "CANCELLED",
    });
    const payout = await ctrl.generate(
      { actorType: "ACADEMY", actorId: "ac-ajena", ...DTO },
      adminReq,
    );
    expect(payout.gross).toBe(0);
    expect(payout.net).toBe(0);
    expect(payout.lines).toEqual([]); // sin bruto → sin líneas de descuento
  });

  it("ACADEMY: el estimado usa gateway_fee.academy_passthrough_pct solo cuando no hay costo real", async () => {
    pf.numbers.set("gateway_fee.academy_passthrough_pct", 5);
    const payout = await ctrl.generate(
      { actorType: "ACADEMY", actorId: "ac-1", ...DTO },
      adminReq,
    );
    // 200 real (evt-acad) + round(25000 × 5%) = 1250 estimado.
    expect(payout.gatewayFee).toBe(1450);
    expect(payout.net).toBe(31550);
  });

  it("VENUE: regla legacy intacta (Σ fee real + platformFeePct, sin passthrough)", async () => {
    pf.numbers.set("platform_fee.default_pct", 10);
    const payout = await ctrl.generate(
      { actorType: "VENUE", actorId: "ven-1", ...DTO },
      adminReq,
    );
    expect(payout.gross).toBe(4000);
    expect(payout.platformFee).toBe(400); // evt-venue sin override → 10% global
    expect(payout.net).toBe(4000 - 50 - 400);
  });

  it("actor sin eventos en el período → payout en ceros", async () => {
    const payout = await ctrl.generate(
      { actorType: "ACADEMY", actorId: "ac-sin-eventos", ...DTO },
      adminReq,
    );
    expect(payout.gross).toBe(0);
    expect(payout.platformFee).toBe(0);
    expect(payout.net).toBe(0);
  });

  it("actorType desconocido → liquidación en ceros (sin romper)", async () => {
    const payout = await ctrl.generate(
      { actorType: "DJ", actorId: "dj-1", ...DTO },
      adminReq,
    );
    expect(payout.gross).toBe(0);
    expect(payout.net).toBe(0);
  });

  it("periodEnd < periodStart → BadRequestException y no crea nada", async () => {
    await expect(
      ctrl.generate(
        {
          actorType: "PRODUCER",
          actorId: "prod-1",
          periodStart: "2025-11-30T00:00:00Z",
          periodEnd: "2025-11-01T00:00:00Z",
        },
        adminReq,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.payouts).toHaveLength(0);
  });
});

describe("AdminPayoutsController - ciclo approve/pay", () => {
  let prisma: FakePrisma;
  let ctrl: AdminPayoutsController;
  let payoutId: string;

  beforeEach(async () => {
    prisma = new FakePrisma();
    const pf = mkParams();
    ctrl = new AdminPayoutsController(
      prisma as unknown as PrismaService,
      pf.params as unknown as ParamsService,
    );
    const payout = await ctrl.generate(
      {
        actorType: "PRODUCER",
        actorId: "prod-1",
        ...DTO,
      },
      adminReq,
    );
    payoutId = payout.id;
  });

  it("approve PENDING → APPROVED + audit", async () => {
    const res = await ctrl.approve(payoutId, adminReq);
    expect(res.status).toBe("APPROVED");
    expect(prisma.auditLogs.at(-1)!.action).toBe("PAYOUT_APPROVE");
  });

  it("approve APPROVED es idempotente (sin nuevo audit)", async () => {
    await ctrl.approve(payoutId, adminReq);
    const audits = prisma.auditLogs.length;
    const res = await ctrl.approve(payoutId, adminReq);
    expect(res.status).toBe("APPROVED");
    expect(prisma.auditLogs).toHaveLength(audits);
  });

  it("pay solo desde APPROVED: PENDING → ConflictException", async () => {
    await expect(ctrl.pay(payoutId, {}, adminReq)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it("pay APPROVED → PAID con paidAt y evidenceUrl + audit", async () => {
    await ctrl.approve(payoutId, adminReq);
    const res = await ctrl.pay(
      payoutId,
      { evidenceUrl: "https://drive.example/comp.pdf" },
      adminReq,
    );
    expect(res.status).toBe("PAID");
    expect(res.paidAt).toBeInstanceOf(Date);
    expect(res.evidenceUrl).toBe("https://drive.example/comp.pdf");
    expect(prisma.auditLogs.at(-1)!.action).toBe("PAYOUT_PAY");
  });

  it("approve PAID → ConflictException", async () => {
    await ctrl.approve(payoutId, adminReq);
    await ctrl.pay(payoutId, {}, adminReq);
    await expect(ctrl.approve(payoutId, adminReq)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it("payout inexistente → NotFoundException en approve y pay", async () => {
    await expect(ctrl.approve("po-x", adminReq)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(ctrl.pay("po-x", {}, adminReq)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
