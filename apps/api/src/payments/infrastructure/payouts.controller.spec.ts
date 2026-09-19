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
import { encodeSeriesPassRef } from "../domain/order-ref";

// AdminPayoutsController.generate → computeSettlement (regla v1):
// - PRODUCER: tickets PAID de sus eventos + SERIES_PASS cuyo refId decodifica
//   a una EventSeries suya.
// - ACADEMY/VENUE: tickets PAID de eventos con academyId/venueId = actor y
//   producerId = null (si hay productor, él devenga).
// - platformFeePct efectivo por evento: override del evento → default del
//   productor → param global. net = gross − fees − platformFee.
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
      continue;
    }
    if (v !== cond) return false;
  }
  return true;
}

interface FakePayment {
  orderType: "TICKET" | "SERIES_PASS";
  status: "PENDING" | "PAID" | "FAILED";
  eventId: string | null;
  refId: string;
  amount: number;
  fee: number;
  createdAt: Date;
}

interface FakePayout {
  id: string;
  actorType: string;
  actorId: string;
  periodStart: Date;
  periodEnd: Date;
  gross: number;
  platformFee: number;
  net: number;
  status: string;
  paidAt: Date | null;
  evidenceUrl: string | null;
  createdAt: Date;
}

class FakePrisma {
  events: Row[] = [];
  series: Row[] = [];
  payments: FakePayment[] = [];
  payouts: FakePayout[] = [];
  auditLogs: Row[] = [];
  private seq = 0;

  event = {
    findMany: async ({ where }: { where: Row }) =>
      this.events.filter((e) => matchWhere(e, where)),
  };

  eventSeries = {
    findMany: async ({ where }: { where: Row }) =>
      this.series.filter((s) => matchWhere(s, where)),
  };

  payment = {
    findMany: async ({ where }: { where: Row }) =>
      this.payments.filter((p) => matchWhere(p as unknown as Row, where)),
  };

  payout = {
    findFirst: async ({ where }: { where: Row }) =>
      this.payouts.find((p) =>
        matchWhere(p as unknown as Row, where),
      ) ?? null,
    findUnique: async ({ where }: { where: { id: string } }) =>
      this.payouts.find((p) => p.id === where.id) ?? null,
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

const mkPayment = (over: Partial<FakePayment>): FakePayment => ({
  orderType: "TICKET",
  status: "PAID",
  eventId: null,
  refId: "tkt_x__u",
  amount: 10000,
  fee: 0,
  createdAt: IN_PERIOD,
  ...over,
});

describe("AdminPayoutsController.generate — computeSettlement", () => {
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
      mkPayment({ eventId: "evt-p1", amount: 10000, fee: 300 }),
      mkPayment({ eventId: "evt-p2", amount: 5000, fee: 100 }),
      mkPayment({ eventId: "evt-other", amount: 7777 }),
      mkPayment({
        orderType: "SERIES_PASS",
        refId: encodeSeriesPassRef("ser-p1", "2025-11"),
        amount: 25000,
      }),
      mkPayment({
        orderType: "SERIES_PASS",
        refId: encodeSeriesPassRef("ser-ajena", "2025-11"),
        amount: 25000,
      }),
      mkPayment({ eventId: "evt-p1", status: "FAILED", amount: 10000 }),
      mkPayment({
        eventId: "evt-p1",
        amount: 10000,
        createdAt: new Date("2025-10-01T00:00:00Z"),
      }),
      mkPayment({ eventId: "evt-acad", amount: 8000, fee: 200 }),
      mkPayment({ eventId: "evt-acad-p", amount: 9000 }),
      mkPayment({ eventId: "evt-venue", amount: 4000, fee: 50 }),
    );
  });

  it("PRODUCER: suma tickets de sus eventos + pases de sus series; excluye ajenos/no-PAID/fuera de período", async () => {
    const payout = await ctrl.generate(
      { actorType: "PRODUCER", actorId: "prod-1", ...DTO },
      adminReq,
    );
    // 10000 (evt-p1) + 5000 (evt-p2) + 25000 (ser-p1). No cuenta evt-other,
    // ser-ajena, FAILED ni el pago de octubre.
    expect(payout.gross).toBe(40000);
  });

  it("PRODUCER: platformFeePct por evento (override) y pases al default del productor; net = gross − fees − platformFee", async () => {
    pf.producers.set("prod-1", {
      serviceFeeClp: null,
      doorAppFeeClp: null,
      doorCashFeeClp: null,
      platformFeePct: 5,
    });
    const payout = await ctrl.generate(
      { actorType: "PRODUCER", actorId: "prod-1", ...DTO },
      adminReq,
    );
    // evt-p1 al 10% (override): 1000; evt-p2 al 5% (productor): 250;
    // pase ser-p1 al 5% (productor): 1250 → platformFee 2500.
    expect(payout.platformFee).toBe(2500);
    expect(payout.net).toBe(40000 - 400 - 2500);
  });

  it("PRODUCER: sin override ni default del productor usa platform_fee.default_pct", async () => {
    pf.numbers.set("platform_fee.default_pct", 8);
    const payout = await ctrl.generate(
      { actorType: "PRODUCER", actorId: "prod-1", ...DTO },
      adminReq,
    );
    // evt-p1 10% → 1000; evt-p2 y pase al 8% global → 400 + 2000.
    expect(payout.platformFee).toBe(1000 + 400 + 2000);
    expect(payout.net).toBe(40000 - 400 - 3400);
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

  it("idempotente: segundo generate con el mismo actor+período devuelve el existente sin auditar", async () => {
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
  });

  it("ACADEMY: solo eventos propios sin productor; platformFeePct del evento aplica", async () => {
    const payout = await ctrl.generate(
      { actorType: "ACADEMY", actorId: "ac-1", ...DTO },
      adminReq,
    );
    // evt-acad (8000) sí; evt-acad-p (9000) tiene productor → no devenga aquí.
    expect(payout.gross).toBe(8000);
    // platformFeePct 20 del evento → 1600; net = 8000 − 200 − 1600.
    expect(payout.platformFee).toBe(1600);
    expect(payout.net).toBe(6200);
  });

  it("ACADEMY: evento sin platformFeePct usa el param global", async () => {
    prisma.events.find((e) => e.id === "evt-acad")!.platformFeePct = null;
    pf.numbers.set("platform_fee.default_pct", 10);
    const payout = await ctrl.generate(
      { actorType: "ACADEMY", actorId: "ac-1", ...DTO },
      adminReq,
    );
    expect(payout.platformFee).toBe(800); // 8000 * 10%
  });

  it("VENUE: mismo patrón que ACADEMY (venueId + producerId null)", async () => {
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

describe("AdminPayoutsController — ciclo approve/pay", () => {
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
