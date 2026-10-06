import { describe, it, expect, beforeEach } from "vitest";
import type { PrismaService } from "../../prisma.service";
import type { ParamsService } from "../../params/params.service";
// Ciclo session.guard ⇄ auth.controller (ver payouts.controller.spec.ts).
import "../../auth/infrastructure/auth.controller";
import { AdminFinanceController } from "./finance.controller";
import { PayoutSettlementService } from "../../payments/application/payout-settlement.service";
import { encodePrivateRef } from "../../payments/domain/order-ref";
import { managedFeeBreakdown } from "../../common/fee-breakdown";

// AdminFinanceController (spec admin-finance-console): consola de
// facturación read-only + operación del ciclo de payouts existente.
// - summary: GMV segmentado (social/academia/SaaS/métodos-propios),
//   ingreso plataforma (neto+IVA+SaaS), costo real de pasarela, cola de
//   payouts PENDING/APPROVED.
// - accrual: pagos PAID sin PayoutLine atribuidos por actor con las
//   mismas reglas del settlement (unliquidatedOnly); OWN_METHOD_* va a
//   receivable (el actor nos debe), no al payable.
// - mrr: PlatformSubscription ACTIVE normalizada a mensual por ciclo;
//   ENTERPRISE/PRO_BIG → customContracts fuera del MRR.

type Row = Record<string, unknown>;

function matchWhere(row: Row, where: Row): boolean {
  for (const [key, cond] of Object.entries(where)) {
    const v = row[key];
    if (cond instanceof Date) {
      if (!(v instanceof Date) || v.getTime() !== cond.getTime()) return false;
      continue;
    }
    if (cond !== null && typeof cond === "object") {
      if (Array.isArray(cond)) continue; // OR/AND: no evaluadas por el fake
      const c = cond as Row;
      if ("in" in c && !(c.in as unknown[]).includes(v)) return false;
      if ("not" in c && v === c.not) return false;
      if ("gte" in c && (!(v instanceof Date) || v < (c.gte as Date)))
        return false;
      if ("lte" in c && (!(v instanceof Date) || v > (c.lte as Date)))
        return false;
      if ("none" in c || "some" in c) {
        const arr = Array.isArray(v) ? (v as Row[]) : [];
        if ("none" in c && arr.length > 0) return false;
        if (
          "some" in c &&
          !arr.some((item) => matchWhere(item, c.some as Row))
        )
          return false;
        continue;
      }
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

const IN = new Date("2025-10-15T12:00:00Z");
const OUT = new Date("2025-09-15T12:00:00Z");

function mkPayment(over: Row = {}): Row {
  return {
    id: `pay-${Math.random().toString(36).slice(2, 8)}`,
    orderType: "TICKET",
    status: "PAID",
    eventId: null,
    refId: "tkt_x__u",
    amount: 10000,
    fee: 0,
    gateway: "FLOW",
    createdAt: IN,
    feeMode: null,
    platformFeeRate: null,
    platformFeeNetClp: null,
    platformFeeVatClp: null,
    gatewayFeeExpected: null,
    gatewayFeeClp: null,
    producerNetClp: null,
    ...over,
  };
}

class FakePrisma {
  payments: Row[] = [];
  payouts: Row[] = [];
  events: Row[] = [];
  series: Row[] = [];
  membershipPlans: Row[] = [];
  classes: Row[] = [];
  privateLessons: Row[] = [];
  subscriptions: Row[] = [];
  academies: Row[] = [];
  people: Row[] = [];
  venues: Row[] = [];

  private findAll(rows: Row[]) {
    return async (args?: { where?: Row }) =>
      rows.filter((r) => !args?.where || matchWhere(r, args.where));
  }

  payment = { findMany: this.findAll(this.payments) };
  payout = { findMany: this.findAll(this.payouts) };
  event = { findMany: this.findAll(this.events) };
  eventSeries = { findMany: this.findAll(this.series) };
  membershipPlan = { findMany: this.findAll(this.membershipPlans) };
  class = { findMany: this.findAll(this.classes) };
  privateLesson = { findMany: this.findAll(this.privateLessons) };
  platformSubscription = { findMany: this.findAll(this.subscriptions) };
  academy = { findMany: this.findAll(this.academies) };
  person = { findMany: this.findAll(this.people) };
  venue = { findMany: this.findAll(this.venues) };
}

function mkParams() {
  const numbers = new Map<string, number>();
  const params = {
    getNumber: async (key: string, fallback: number) =>
      numbers.get(key) ?? fallback,
    getProducerParams: async () => null,
  };
  return { params, numbers };
}

describe("AdminFinanceController", () => {
  let prisma: FakePrisma;
  let pf: ReturnType<typeof mkParams>;
  let ctrl: AdminFinanceController;

  beforeEach(() => {
    prisma = new FakePrisma();
    pf = mkParams();
    const prismaCast = prisma as unknown as PrismaService;
    ctrl = new AdminFinanceController(
      prismaCast,
      pf.params as unknown as ParamsService,
      new PayoutSettlementService(
        prismaCast,
        pf.params as unknown as ParamsService,
      ),
    );

    prisma.events.push(
      { id: "evt-p1", producerId: "prod-1", platformFeePct: 10 },
      { id: "evt-acad", academyId: "ac-1", producerId: null, platformFeePct: 10 },
    );
    prisma.people.push(
      { id: "prod-1", name: "Productora Uno" },
      { id: "prod-9", name: "Otra Productora" },
    );
    prisma.academies.push({ id: "ac-1", name: "Academia Uno" });
    prisma.venues.push({ id: "ven-1", name: "Club Venue" });

    prisma.payments.push(
      // Social managed: ticket del productor con desglose congelado 10%.
      mkPayment({
        eventId: "evt-p1",
        amount: 6000,
        ...managedFeeBreakdown(6000, 10, 3.19, 19),
        feeMode: "MANAGED",
      }),
      // Social: pase de serie gestionado (otro productor).
      mkPayment({
        orderType: "SERIES_PASS",
        refId: "sp_ser-p1_2026-10_x",
        amount: 5000,
        ...managedFeeBreakdown(5000, 10, 3.19, 19),
        feeMode: "MANAGED",
      }),
      // Academia: plan vendido online (feeMode ACADEMY - SaaS, sin fee).
      mkPayment({
        orderType: "MEMBERSHIP",
        refId: "mem_mp-1_x",
        amount: 20000,
        feeMode: "ACADEMY",
        gatewayFeeClp: 638,
        producerNetClp: 20000,
      }),
      // SaaS: suscripción de plataforma (ingreso 100% nuestro).
      mkPayment({ orderType: "PLATFORM_SUB", amount: 14990 }),
      // Método propio del productor: plata ajena, comisión devengada.
      mkPayment({
        eventId: "evt-p1",
        amount: 10000,
        gateway: "MANUAL",
        feeMode: "OWN_METHOD",
        platformFeeRate: 6.81,
        platformFeeNetClp: 572,
        platformFeeVatClp: 109,
      }),
      // Fuera del período y no-PAID no cuentan.
      mkPayment({ eventId: "evt-p1", amount: 9999, createdAt: OUT }),
      mkPayment({ eventId: "evt-p1", amount: 8888, status: "FAILED" }),
      // PRIVATE de la academia - aparece en accrual, no en GMV academia
      // (sí: MEMBERSHIP/WORKSHOP/PRIVATE entran al segmento academia).
      mkPayment({
        orderType: "PRIVATE",
        refId: encodePrivateRef("ac-1"),
        amount: 25000,
        feeMode: "ACADEMY",
        producerNetClp: 25000,
      }),
    );

    prisma.series.push({ id: "ser-p1", producerId: "prod-1" });

    prisma.payouts.push(
      {
        id: "po-1",
        actorType: "PRODUCER",
        actorId: "prod-1",
        status: "PENDING",
        net: 30000,
      },
      {
        id: "po-2",
        actorType: "ACADEMY",
        actorId: "ac-1",
        status: "APPROVED",
        net: 20000,
      },
      { id: "po-3", actorType: "VENUE", actorId: "ven-1", status: "PAID", net: 1 },
    );
  });

  describe("summary", () => {
    it("segmenta el GMV por línea de negocio y separa lo cobrado por métodos propios", async () => {
      const s = await ctrl.summary("2025-10-01", "2025-10-31");
      expect(s.gmv.social).toBe(11000); // ticket 6000 + pase 5000
      expect(s.gmv.academy).toBe(45000); // membership 20000 + private 25000
      expect(s.gmv.saas).toBe(14990);
      // La venta por transferencia propia no pasó por la pasarela.
      expect(s.gmv.ownMethod).toBe(10000);
      // FAILED y fuera de período quedan fuera de todos los segmentos.
      expect(s.gmv.social + s.gmv.academy + s.gmv.saas).toBe(70990);
    });

    it("ingreso plataforma = fee neto + IVA (managed + own-method) + SaaS completo", async () => {
      const s = await ctrl.summary("2025-10-01", "2025-10-31");
      const managed = managedFeeBreakdown(6000, 10, 3.19, 19);
      const pass = managedFeeBreakdown(5000, 10, 3.19, 19);
      const net =
        managed.platformFeeNetClp! + pass.platformFeeNetClp! + 572;
      const vat =
        managed.platformFeeVatClp! + pass.platformFeeVatClp! + 109;
      expect(s.platformRevenue.net).toBe(net);
      expect(s.platformRevenue.vat).toBe(vat);
      expect(s.platformRevenue.saas).toBe(14990);
      expect(s.platformRevenue.total).toBe(net + vat + 14990);
    });

    it("costo de pasarela = lo realmente reportado por el gateway", async () => {
      const s = await ctrl.summary("2025-10-01", "2025-10-31");
      // Solo el ticket de academia reportó costo real (638).
      expect(s.gatewayCost).toBe(638);
    });

    it("cola de payouts: PENDING y APPROVED con count + net", async () => {
      const s = await ctrl.summary("2025-10-01", "2025-10-31");
      expect(s.pendingPayout.pending).toEqual({ count: 1, net: 30000 });
      expect(s.pendingPayout.approved).toEqual({ count: 1, net: 20000 });
    });
  });

  describe("accrual", () => {
    it("atribuye pagos sin PayoutLine a su actor con el settlement real", async () => {
      const rows = await ctrl.accrual();
      const prod = rows.find((r) => r.actorId === "prod-1")!;
      // De prod-1: ticket 6000 (net ~5400) + pase 5000 (net ~4500);
      // el de 9999 (fuera) NO: unliquidated no filtra período pero sí es
      // PAID sin líneas → SÍ entra (histórico devengado).
      expect(prod.actorType).toBe("PRODUCER");
      expect(prod.actorName).toBe("Productora Uno");
      expect(prod.gross).toBe(6000 + 5000 + 9999);
      expect(prod.estimatedNet).toBeGreaterThan(0);
      expect(prod.estimatedNet).toBeLessThan(prod.gross);
      // OWN_METHOD: no suma al gross - va a receivable (nos debe 572+109).
      expect(prod.ownMethodReceivable).toBe(681);
      const acad = rows.find((r) => r.actorId === "ac-1")!;
      // La academia devenga su PRIVATE + MEMBERSHIP (modelo SaaS - la
      // membresía también es suya vía mem_mp-1).
      expect(acad.actorName).toBe("Academia Uno");
      expect(acad.gross).toBe(25000); // solo PRIVATE: mp-1 no existe en planes
    });

    it("un pago ya liquidado (con PayoutLine) no aparece en el accrual", async () => {
      for (const p of prisma.payments) p.payoutLines = [{ id: "pl-1" }];
      const rows = await ctrl.accrual();
      expect(rows).toEqual([]);
    });

    it("PLATFORM_SUB nunca devenga a un actor (ingreso directo)", async () => {
      const rows = await ctrl.accrual();
      expect(
        rows.some((r) => (r.actorType as string) === "PLATFORM"),
      ).toBe(false);
      // El pago PLATFORM_SUB del fixture no atribuye a nadie; la
      // membresía tampoco (mem_mp-1 no existe como plan).
      const total = rows.reduce((a, r) => a + r.gross, 0);
      expect(total).toBe(6000 + 5000 + 9999 + 25000);
    });
  });

  describe("mrr", () => {
    beforeEach(() => {
      pf.numbers.set("academy_tier.pro_monthly_clp", 19980);
      pf.numbers.set("academy_tier.pro_annual_clp", 239760);
      pf.numbers.set("producer_tier.growth_monthly_clp", 29990);
      prisma.subscriptions.push(
        {
          id: "sub-1",
          kind: "ACADEMY",
          academyId: "ac-1",
          personId: "prod-9",
          tierCode: "PRO",
          billingCycle: "ANNUAL",
          status: "ACTIVE",
          nextInvoiceAt: new Date("2027-10-01"),
        },
        {
          id: "sub-2",
          kind: "ACADEMY",
          academyId: "ac-2",
          personId: "prod-9",
          tierCode: "PRO",
          billingCycle: "MONTHLY",
          status: "ACTIVE",
          nextInvoiceAt: new Date("2026-11-01"),
        },
        {
          id: "sub-3",
          kind: "PRODUCER",
          producerId: "prod-1",
          personId: "prod-1",
          tierCode: "PRO_GROWTH",
          billingCycle: "MONTHLY",
          status: "ACTIVE",
          nextInvoiceAt: new Date("2026-11-05"),
        },
        {
          id: "sub-4",
          kind: "ACADEMY",
          academyId: "ac-3",
          personId: "prod-9",
          tierCode: "ENTERPRISE",
          billingCycle: "ANNUAL",
          status: "ACTIVE",
          nextInvoiceAt: null,
        },
        {
          id: "sub-5",
          kind: "ACADEMY",
          academyId: "ac-1",
          personId: "prod-9",
          tierCode: "PRO",
          billingCycle: "MONTHLY",
          status: "CANCEL_PENDING",
          nextInvoiceAt: null,
        },
        {
          id: "sub-6",
          kind: "ACADEMY",
          academyId: "ac-1",
          personId: "prod-9",
          tierCode: "PRO",
          billingCycle: "MONTHLY",
          status: "FAILED_CARD",
          nextInvoiceAt: null,
        },
      );
    });

    it("MRR = precio del tier normalizado a mensual por ciclo; ENTERPRISE va a customContracts", async () => {
      const m = await ctrl.mrr();
      // 239760/12 = 19980 (anual) + 19980 (mensual) + 29990 (producer).
      expect(m.mrr).toBe(19980 + 19980 + 29990);
      expect(m.arr).toBe(m.mrr * 12);
      expect(m.customContracts).toBe(1); // ENTERPRISE a convenir
    });

    it("funnel reporta los estados no-ACTIVE por separado", async () => {
      const m = await ctrl.mrr();
      expect(m.funnel.ACTIVE).toBe(4);
      expect(m.funnel.CANCEL_PENDING).toBe(1);
      expect(m.funnel.FAILED_CARD).toBe(1);
      // CANCEL_PENDING y FAILED_CARD no suman MRR.
      expect(m.mrr).toBe(69950);
    });

    it("subscriptions listadas con nombre del actor y mensual normalizado", async () => {
      const m = await ctrl.mrr();
      const annual = m.subscriptions.find((s) => s.id === "sub-1")!;
      expect(annual.actorName).toBe("Academia Uno");
      expect(annual.monthlyAmount).toBe(19980);
      const prod = m.subscriptions.find((s) => s.id === "sub-3")!;
      expect(prod.actorName).toBe("Productora Uno");
      expect(prod.monthlyAmount).toBe(29990);
    });
  });
});
