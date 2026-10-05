import { describe, it, expect, beforeEach, vi } from "vitest";
import { randomUUID } from "node:crypto";
import type { Payment } from "@prisma/client";
import type { PrismaService } from "../../prisma.service";
import type { ParamsService } from "../../params/params.service";
import type { NotificationsService } from "../../notifications/domain/notifications.service";
import { PaymentSettlementService } from "./payment-settlement.service";

// PaymentSettlementService - el foco es la instrumentación del ledger
// (STATUS_CONFIRMED / SETTLED / RENEWAL_SETTLED / FAILED / AMOUNT_MISMATCH
// solo en la transición real) y la persistencia de la verdad monetaria
// Flow (campos gateway*). PrismaService se mockea como objeto plano con
// vi.fn(); $transaction ejecuta el callback con el mismo fake como tx.

type Row = Record<string, unknown>;

function mkPayment(over: Partial<Row> = {}): Payment {
  return {
    id: "pay1",
    orderType: "MEMBERSHIP",
    refId: `mem_plan1_${randomUUID()}`,
    personId: "p1",
    eventId: null,
    discountCodeId: null,
    amount: 10500,
    fee: 0,
    net: 10500,
    quantity: 1,
    recipients: null,
    channel: null,
    unitListPrice: null,
    unitServiceFee: null,
    tablePartySize: null,
    gateway: "FLOW",
    gatewayRef: "777",
    gatewayFeeClp: null,
    gatewayReportedAmount: null,
    gatewayMedia: null,
    gatewayPaidAt: null,
    gatewayRaw: null,
    status: "PENDING",
    createdAt: new Date(),
    ...over,
  } as Payment;
}

function mkPrisma() {
  const payments = new Map<string, Row>();
  const events: Row[] = [];
  const enrollments: Row[] = [];
  const tickets: Row[] = [];
  const bookings: Row[] = [];
  const lessons: Row[] = [];
  const admins: { personId: string }[] = [];

  const prisma = {
    payment: {
      findUnique: vi.fn(
        async ({ where }: { where: { id: string } }) =>
          payments.get(where.id) ?? null,
      ),
      update: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: Row;
        }) => {
          const row = payments.get(where.id);
          if (row) Object.assign(row, data);
          return row;
        },
      ),
      // claim atómico del settle: filtra por id + status (string o {not}).
      updateMany: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string; status?: string | { not: string } };
          data: Row;
        }) => {
          const row = payments.get(where.id);
          const st = where.status;
          const ok =
            !!row &&
            (st === undefined ||
              st === row.status ||
              (typeof st === "object" && st.not !== row.status));
          if (!ok) return { count: 0 };
          Object.assign(row, data);
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
        // Round-trip JSON como jsonb real (ver payment-ledger.spec).
        const stored = JSON.parse(JSON.stringify(data));
        events.push(stored);
        return stored;
      }),
    },
    event: {
      findUnique: vi.fn(async () => ({
        presalePrice: 8000,
        serviceFeeClp: null,
        name: "Social SBK",
        startsAt: new Date("2026-09-26T01:00:00Z"),
        producerId: "prod1",
      })),
    },
    ticket: {
      create: vi.fn(async ({ data }: { data: Row }) => {
        tickets.push(data);
        return data;
      }),
    },
    tableReservation: {
      findFirst: vi.fn(async () => null),
      create: vi.fn(async ({ data }: { data: Row }) => data),
    },
    discountCode: {
      findUnique: vi.fn(async () => null),
      update: vi.fn(async () => ({})),
    },
    discountRedemption: {
      create: vi.fn(async ({ data }: { data: Row }) => data),
    },
    person: {
      findUnique: vi.fn(async () => ({ name: "Comprador" })),
    },
    personRole: {
      findMany: vi.fn(async () => admins),
    },
    membershipPlan: {
      findUnique: vi.fn(
        async (): Promise<{
          id: string;
          name: string;
          type: string;
          periodDays: number | null;
          academyId: string;
          academy: { name: string };
        } | null> => ({
          id: "plan1",
          name: "Mensual",
          type: "MONTHLY",
          periodDays: null,
          academyId: "ac1",
          academy: { name: "Academia X" },
        }),
      ),
    },
    enrollment: {
      findFirst: vi.fn(async (): Promise<Row | null> => null),
      create: vi.fn(async ({ data }: { data: Row }) => {
        enrollments.push(data);
        return data;
      }),
      update: vi.fn(async ({ data }: { data: Row }) => data),
    },
    classSeries: {
      findUnique: vi.fn(async () => ({ name: "Serie Bachata" })),
    },
    class: {
      findUnique: vi.fn(async () => ({
        id: "cls1",
        capacity: null,
        slot: {
          academyId: "ac1",
          capacity: 10,
          startTime: "20:00",
          series: { name: "Taller Shines", quorum: null },
          academy: { defaultQuorum: null },
        },
      })),
    },
    classBooking: {
      count: vi.fn(async () => 0),
      findUnique: vi.fn(async () => null),
      create: vi.fn(async ({ data }: { data: Row }) => {
        bookings.push(data);
        return data;
      }),
      update: vi.fn(async ({ data }: { data: Row }) => data),
    },
    seriesPass: {
      upsert: vi.fn(async ({ create }: { create: Row }) => create),
    },
    academy: {
      findUnique: vi.fn(async () => ({
        id: "ac1",
        name: "Academia X",
        ownerId: "owner1",
      })),
    },
    privateLesson: {
      create: vi.fn(async ({ data }: { data: Row }) => {
        lessons.push(data);
        return data;
      }),
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn(prisma),
    // pg_advisory_xact_lock del ledger - no-op en el fake.
    $executeRaw: vi.fn(async () => 0),
  };
  return {
    prisma,
    payments,
    events,
    enrollments,
    tickets,
    bookings,
    lessons,
    admins,
  };
}

function mkNotifications() {
  return {
    notifySafe: vi.fn(
      async (_personId: string, _input: { type: string }) => undefined,
    ),
  };
}

function mkParams() {
  return { getNumber: vi.fn(async (_k: string, fallback: number) => fallback) };
}

const GATEWAY_DATA = {
  fee: 335,
  amount: 10500,
  media: "Webpay Plus",
  transferDate: "2026-09-24T15:30:00.000Z",
  payerEmail: "fan@example.cl",
};

describe("PaymentSettlementService", () => {
  let fx: ReturnType<typeof mkPrisma>;
  let notifications: ReturnType<typeof mkNotifications>;
  let svc: PaymentSettlementService;

  beforeEach(() => {
    fx = mkPrisma();
    notifications = mkNotifications();
    svc = new PaymentSettlementService(
      fx.prisma as unknown as PrismaService,
      mkParams() as unknown as ParamsService,
      notifications as unknown as NotificationsService,
    );
  });

  function seed(payment: Payment) {
    fx.payments.set(payment.id, payment as unknown as Row);
    return payment;
  }

  function eventTypes(paymentId = "pay1") {
    return fx.events
      .filter((e) => e.paymentId === paymentId)
      .map((e) => e.type);
  }

  describe("settle MEMBERSHIP PAID", () => {
    it("emite STATUS_CONFIRMED + SETTLED y persiste los campos gateway", async () => {
      const payment = seed(mkPayment());
      const out = await svc.settle(payment, "PAID", {
        actor: "webhook",
        gatewayData: GATEWAY_DATA,
      });

      expect(out).toEqual({ ok: true, status: "PAID" });
      expect(eventTypes()).toEqual(["STATUS_CONFIRMED", "SETTLED"]);

      const stored = fx.payments.get("pay1")!;
      expect(stored.status).toBe("PAID");
      expect(stored.gatewayFeeClp).toBe(335);
      expect(stored.gatewayReportedAmount).toBe(10500);
      expect(stored.gatewayMedia).toBe("Webpay Plus");
      expect(stored.gatewayPaidAt).toEqual(
        new Date("2026-09-24T15:30:00.000Z"),
      );
      expect(stored.gatewayRaw).toEqual(GATEWAY_DATA);

      const confirmed = fx.events[0];
      expect(confirmed.actor).toBe("webhook");
      expect(confirmed.payload).toEqual({
        remoteStatus: "PAID",
        gatewayRef: "777",
      });
      const settled = fx.events[1];
      expect(settled.payload).toMatchObject({
        orderType: "MEMBERSHIP",
        amount: 10500,
        planId: "plan1",
        academyId: "ac1",
      });

      // efectos de dominio: enrollment materializado + notify al comprador
      expect(fx.enrollments).toHaveLength(1);
      expect(fx.enrollments[0]).toMatchObject({
        academyId: "ac1",
        personId: "p1",
        planId: "plan1",
        status: "ACTIVE",
      });
      expect(notifications.notifySafe).toHaveBeenCalledWith(
        "p1",
        expect.objectContaining({ type: "payment.membership" }),
      );
    });

    it("kind 'renewal' → RENEWAL_SETTLED en vez de SETTLED", async () => {
      const payment = seed(mkPayment());
      await svc.settle(payment, "PAID", {
        actor: "cron",
        kind: "renewal",
      });
      expect(eventTypes()).toEqual(["STATUS_CONFIRMED", "RENEWAL_SETTLED"]);
      expect(fx.events[1].actor).toBe("cron");
    });

    it("plan TRIAL → crea Enrollment TRIAL nuevo (sin findFirst/update) + notif 'Clase de prueba comprada'", async () => {
      // La alumna ya tiene una inscripción ACTIVE vigente - el settle
      // TRIAL ni la lee: siempre crea una fila aparte.
      fx.prisma.enrollment.findFirst.mockResolvedValue({
        id: "enr-active",
        status: "ACTIVE",
        startedAt: new Date(Date.now() - 30 * 86_400_000),
        endsAt: new Date(Date.now() + 30 * 86_400_000),
      });
      fx.prisma.membershipPlan.findUnique.mockResolvedValue({
        id: "plantrial",
        name: "Clase de prueba",
        type: "TRIAL",
        periodDays: null,
        academyId: "ac1",
        academy: { name: "Academia X" },
      });
      const payment = seed(
        mkPayment({ refId: `mem_plantrial_${randomUUID()}` }),
      );

      const out = await svc.settle(payment, "PAID", { actor: "webhook" });

      expect(out).toEqual({ ok: true, status: "PAID" });
      expect(fx.enrollments).toHaveLength(1);
      expect(fx.enrollments[0]).toMatchObject({
        academyId: "ac1",
        personId: "p1",
        planId: "plantrial",
        status: "TRIAL",
        endsAt: null, // sin periodDays → la prueba queda sin fecha
      });
      // la vigente quedó intacta: ni siquiera se consultó ni actualizó
      expect(fx.prisma.enrollment.findFirst).not.toHaveBeenCalled();
      expect(fx.prisma.enrollment.update).not.toHaveBeenCalled();

      expect(notifications.notifySafe).toHaveBeenCalledWith(
        "p1",
        expect.objectContaining({
          type: "payment.membership",
          title: "Clase de prueba comprada",
        }),
      );
      const notif = notifications.notifySafe.mock.calls.find(
        ([, input]) => input.type === "payment.membership",
      )![1] as { body?: string };
      expect(notif.body).toBe("Clase de prueba · Academia X · $10.500");
    });

    it("plan TRIAL con periodDays → endsAt = now + periodDays", async () => {
      fx.prisma.membershipPlan.findUnique.mockResolvedValue({
        id: "plantrial",
        name: "Semana de prueba",
        type: "TRIAL",
        periodDays: 7,
        academyId: "ac1",
        academy: { name: "Academia X" },
      });
      const payment = seed(
        mkPayment({ refId: `mem_plantrial_${randomUUID()}` }),
      );
      await svc.settle(payment, "PAID", { actor: "webhook" });
      const endsAt = fx.enrollments[0].endsAt as Date;
      const delta = endsAt.getTime() - Date.now();
      expect(delta).toBeGreaterThan(6 * 86_400_000);
      expect(delta).toBeLessThanOrEqual(7 * 86_400_000);
    });

    it("re-compra del plan TRIAL → cada liquidación crea su propia fila TRIAL", async () => {
      fx.prisma.membershipPlan.findUnique.mockResolvedValue({
        id: "plantrial",
        name: "Clase de prueba",
        type: "TRIAL",
        periodDays: null,
        academyId: "ac1",
        academy: { name: "Academia X" },
      });
      const p1 = seed(mkPayment({ refId: `mem_plantrial_${randomUUID()}` }));
      const p2 = seed(
        mkPayment({ id: "pay2", refId: `mem_plantrial_${randomUUID()}` }),
      );
      await svc.settle(p1, "PAID", { actor: "webhook" });
      await svc.settle(p2, "PAID", { actor: "webhook" });
      expect(fx.enrollments).toHaveLength(2);
      expect(fx.enrollments.map((e) => e.status)).toEqual([
        "TRIAL",
        "TRIAL",
      ]);
    });

    it("sin gatewayData → los campos gateway quedan en null", async () => {
      const payment = seed(mkPayment());
      await svc.settle(payment, "PAID", { actor: "polling" });
      const stored = fx.payments.get("pay1")!;
      expect(stored.status).toBe("PAID");
      expect(stored.gatewayFeeClp).toBeNull();
      expect(stored.gatewayRaw).toBeNull();
      expect(eventTypes()).toEqual(["STATUS_CONFIRMED", "SETTLED"]);
    });
  });

  describe("AMOUNT_MISMATCH", () => {
    it("monto reportado ≠ Payment.amount → evento + notify a admins", async () => {
      fx.admins.push({ personId: "admin1" }, { personId: "admin2" });
      const payment = seed(mkPayment());
      await svc.settle(payment, "PAID", {
        actor: "webhook",
        gatewayData: { ...GATEWAY_DATA, amount: 9999 },
      });

      expect(eventTypes()).toEqual([
        "STATUS_CONFIRMED",
        "AMOUNT_MISMATCH",
        "SETTLED",
      ]);
      const mismatch = fx.events.find((e) => e.type === "AMOUNT_MISMATCH")!;
      expect(mismatch.payload).toEqual({ expected: 10500, reported: 9999 });

      const adminCalls = notifications.notifySafe.mock.calls.filter(
        ([personId, input]) =>
          input.type === "payment.amount_mismatch" &&
          typeof personId === "string",
      );
      expect(adminCalls.map(([p]) => p)).toEqual(["admin1", "admin2"]);
    });

    it("monto reportado = Payment.amount → sin AMOUNT_MISMATCH", async () => {
      const payment = seed(mkPayment());
      await svc.settle(payment, "PAID", {
        actor: "webhook",
        gatewayData: GATEWAY_DATA,
      });
      expect(eventTypes()).not.toContain("AMOUNT_MISMATCH");
    });
  });

  describe("idempotencia", () => {
    it("payment ya PAID → duplicated sin eventos ni efectos", async () => {
      const payment = seed(mkPayment({ status: "PAID" }));
      const out = await svc.settle(payment, "PAID", { actor: "webhook" });
      expect(out).toEqual({ ok: true, status: "PAID", duplicated: true });
      expect(fx.events).toHaveLength(0);
      expect(fx.enrollments).toHaveLength(0);
      expect(notifications.notifySafe).not.toHaveBeenCalled();
    });
  });

  describe("settle FAILED", () => {
    it("PENDING → FAILED emite STATUS_CONFIRMED + FAILED y notifica", async () => {
      const payment = seed(mkPayment());
      const out = await svc.settle(payment, "FAILED", { actor: "webhook" });
      expect(out).toEqual({ ok: true, status: "FAILED" });
      expect(fx.payments.get("pay1")!.status).toBe("FAILED");
      expect(eventTypes()).toEqual(["STATUS_CONFIRMED", "FAILED"]);
      expect(fx.events[0].payload).toEqual({
        remoteStatus: "FAILED",
        gatewayRef: "777",
      });
      expect(notifications.notifySafe).toHaveBeenCalledWith(
        "p1",
        expect.objectContaining({ type: "payment.failed" }),
      );
    });

    it("ya FAILED → re-notificación no emite eventos ni re-notifica", async () => {
      const payment = seed(mkPayment({ status: "FAILED" }));
      await svc.settle(payment, "FAILED", { actor: "webhook" });
      expect(fx.events).toHaveLength(0);
      expect(notifications.notifySafe).not.toHaveBeenCalled();
    });
  });

  describe("settle TICKET PAID", () => {
    it("emite tickets + eventos con detalle del evento", async () => {
      const payment = seed(
        mkPayment({
          orderType: "TICKET",
          refId: `tkt_ev1__${randomUUID()}`,
          eventId: "ev1",
          quantity: 2,
          amount: 21000,
        }),
      );
      const out = await svc.settle(payment, "PAID", {
        actor: "webhook",
        gatewayData: { ...GATEWAY_DATA, amount: 21000 },
      });
      expect(out).toEqual({ ok: true, status: "PAID" });
      expect(eventTypes()).toEqual(["STATUS_CONFIRMED", "SETTLED"]);
      // quantity 2 sin recipients → comprador + 1 reclamable
      expect(fx.tickets).toHaveLength(2);
      expect(fx.tickets[1].claimToken).toBeTruthy();
      expect(notifications.notifySafe).toHaveBeenCalledWith(
        "p1",
        expect.objectContaining({ type: "payment.paid" }),
      );
    });
  });

  describe("settle WORKSHOP (clase suelta)", () => {
    const wksPayment = () =>
      mkPayment({
        orderType: "WORKSHOP",
        refId: `wks_cls1_${randomUUID()}`,
        amount: 9500,
        net: 9500,
      });

    it("PAID con cupo → ClassBooking BOOKED con paymentId + SETTLED", async () => {
      const payment = seed(wksPayment());
      const out = await svc.settle(payment, "PAID", {
        actor: "webhook",
        gatewayData: { ...GATEWAY_DATA, amount: 9500 },
      });

      expect(out).toEqual({ ok: true, status: "PAID" });
      expect(eventTypes()).toEqual(["STATUS_CONFIRMED", "SETTLED"]);
      expect(fx.bookings).toHaveLength(1);
      expect(fx.bookings[0]).toMatchObject({
        classId: "cls1",
        personId: "p1",
        status: "BOOKED",
        paymentId: "pay1",
      });
      expect(notifications.notifySafe).toHaveBeenCalledWith(
        "p1",
        expect.objectContaining({ type: "payment.paid" }),
      );
    });

    it("PAID sin cupo → la reserva queda WAITLIST (pagó, queda en cola)", async () => {
      fx.prisma.classBooking.count.mockResolvedValue(10); // capacidad 10
      const payment = seed(wksPayment());
      await svc.settle(payment, "PAID", { actor: "webhook" });
      expect(fx.bookings[0].status).toBe("WAITLIST");
      expect(fx.bookings[0].paymentId).toBe("pay1");
    });

    it("re-notificación PAID → duplicated, sin re-crear reserva", async () => {
      const payment = seed(wksPayment());
      await svc.settle(payment, "PAID", { actor: "webhook" });
      const out = await svc.settle(payment, "PAID", { actor: "webhook" });
      expect(out.duplicated).toBe(true);
      expect(fx.bookings).toHaveLength(1);
    });

    it("FAILED → no crea reserva", async () => {
      const payment = seed(wksPayment());
      await svc.settle(payment, "FAILED", { actor: "webhook" });
      expect(fx.bookings).toHaveLength(0);
    });
  });

  describe("settle PRIVATE (clase particular comprable)", () => {
    const pvtPayment = () =>
      mkPayment({
        orderType: "PRIVATE",
        refId: `pvt_ac1_${randomUUID()}`,
        amount: 40500,
        net: 40500,
        unitListPrice: 40000,
      });

    it("PAID → PrivateLesson REQUESTED sin instructor/fecha + SETTLED + notify owner", async () => {
      const payment = seed(pvtPayment());
      const out = await svc.settle(payment, "PAID", {
        actor: "webhook",
        gatewayData: { ...GATEWAY_DATA, amount: 40500 },
      });

      expect(out).toEqual({ ok: true, status: "PAID" });
      expect(eventTypes()).toEqual(["STATUS_CONFIRMED", "SETTLED"]);
      expect(fx.lessons).toHaveLength(1);
      expect(fx.lessons[0]).toMatchObject({
        academyId: "ac1",
        personId: "p1",
        instructorId: null,
        scheduledAt: null,
        price: 40000,
        paymentId: "pay1",
        status: "REQUESTED",
      });
      // owner notificado (hay que asignar) + comprador (pago ok)
      expect(notifications.notifySafe).toHaveBeenCalledWith(
        "owner1",
        expect.objectContaining({ type: "academy.private_lesson.sold" }),
      );
      expect(notifications.notifySafe).toHaveBeenCalledWith(
        "p1",
        expect.objectContaining({ type: "payment.paid" }),
      );
    });

    it("re-notificación PAID → duplicated, sin duplicar lección", async () => {
      const payment = seed(pvtPayment());
      await svc.settle(payment, "PAID", { actor: "webhook" });
      const out = await svc.settle(payment, "PAID", { actor: "webhook" });
      expect(out.duplicated).toBe(true);
      expect(fx.lessons).toHaveLength(1);
    });

    it("FAILED → no crea lección", async () => {
      const payment = seed(pvtPayment());
      await svc.settle(payment, "FAILED", { actor: "webhook" });
      expect(fx.lessons).toHaveLength(0);
    });
  });

  describe("recordWebhookReceived", () => {
    it("emite WEBHOOK_RECEIVED siempre, con refId + status + body", async () => {
      const payment = seed(mkPayment());
      await svc.recordWebhookReceived(payment, {
        remoteStatus: "PAID",
        body: { token: "tok9" },
      });
      // y una segunda vez (webhook duplicado) también queda en el ledger
      await svc.recordWebhookReceived(payment, {
        remoteStatus: "PAID",
        body: { token: "tok9" },
      });
      expect(eventTypes()).toEqual(["WEBHOOK_RECEIVED", "WEBHOOK_RECEIVED"]);
      expect(fx.events[0].payload).toEqual({
        refId: payment.refId,
        remoteStatus: "PAID",
        body: { token: "tok9" },
      });
      expect(fx.events[1].seq).toBe(2);
      expect(fx.events[1].prevHash).toBe(fx.events[0].payloadHash);
    });
  });
});
