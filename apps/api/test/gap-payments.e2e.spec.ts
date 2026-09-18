import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { Test } from "@nestjs/testing";
import { ValidationPipe, type INestApplication } from "@nestjs/common";
import { PaymentsModule } from "../src/payments/payments.module";
import { CheckinsModule } from "../src/checkins/checkins.module";
import { AuthModule } from "../src/auth/auth.module";
import { AuthService } from "../src/auth/domain/auth.service";
import { PrismaModule } from "../src/prisma.module";
import { PrismaService } from "../src/prisma.service";
import { QrService } from "../src/qr/domain/qr.service";
import { encodeSeriesPassRef } from "../src/payments/domain/order-ref";
// Los controllers de payouts se declaran a nivel del TestingModule hasta que
// queden registrados en PaymentsModule (los módulos no se tocan en este cambio).
import {
  AdminPayoutsController,
  MePayoutsController,
} from "../src/payments/infrastructure/payouts.controller";

/** Mes calendario local "YYYY-MM" — misma regla que checkins.service. */
const currentMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

describe("gap-payments e2e (series-pass + payouts)", () => {
  let app: INestApplication;
  let baseUrl: string;
  let prisma: PrismaService;
  const auth = new AuthService(
    process.env.JWT_SECRET ?? "dev-secret-change-me",
  );
  const qr = new QrService(process.env.QR_SECRET ?? "dev-qr-secret-change-me");

  let adminId: string;
  let adminSession: string;
  let buyerId: string;
  let buyerSession: string;
  let dancerId: string;
  let dancerSession: string;
  let payoutProducerId: string;
  let payoutProducerSession: string;

  const suffix = Date.now().toString(36);
  const MONTH = currentMonth();

  const ids = {
    venueId: "",
    seriesId: "", // serie activa del producer (checkout + check-in)
    inactiveSeriesId: "",
    seriesEventId: "", // evento PUBLISHED de la serie
    producerId: "",
    payoutProducerId: "",
    payoutSeriesId: "",
    payoutEventId: "",
    otherProducerId: "",
    otherSeriesId: "",
    otherEventId: "",
    academyId: "", // academia del payoutProducer (me/payouts + ACADEMY)
    academyEventId: "", // evento de la academia SIN productor → devenga ACADEMY
    academyProducedEventId: "", // evento de la academia CON productor → no devenga
    venueEventId: "", // evento del venue SIN productor → devenga VENUE
    venueProducedEventId: "", // evento del venue CON productor → no devenga
    payoutIds: [] as string[],
    checkinIds: [] as string[],
  };

  const post = (path: string, body: unknown, session?: string) =>
    fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(session ? { cookie: `omnidance_session=${session}` } : {}),
      },
      body: JSON.stringify(body),
    });

  const get = (path: string, session?: string) =>
    fetch(`${baseUrl}${path}`, {
      headers: session ? { cookie: `omnidance_session=${session}` } : {},
    });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PaymentsModule, CheckinsModule, AuthModule, PrismaModule],
      controllers: [AdminPayoutsController, MePayoutsController],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api");
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    await app.listen(0);
    prisma = app.get(PrismaService);
    const address = app.getHttpServer().address();
    baseUrl = `http://127.0.0.1:${address.port}`;

    // params deterministas para el quote del pase
    await prisma.platformParam.upsert({
      where: { key: "series_pass.price_clp" },
      update: { value: 25000 },
      create: { key: "series_pass.price_clp", value: 25000 },
    });
    await prisma.platformParam.upsert({
      where: { key: "service_fee.series_pass_clp" },
      update: { value: 500 },
      create: { key: "service_fee.series_pass_clp", value: 500 },
    });

    // ─── personas ───
    const admin = await prisma.person.findFirstOrThrow({
      where: { email: "admin@omnidance.dev" },
    });
    adminId = admin.id;
    adminSession = await auth.issueSession(admin.id);

    const mkPerson = (name: string, role?: string) =>
      prisma.person.create({
        data: {
          name: `${name} ${suffix}`,
          roles: role
            ? { create: [{ role, status: "APPROVED" }] }
            : undefined,
        },
      });

    const buyer = await mkPerson("Buyer SeriesPass", "DANCER");
    buyerId = buyer.id;
    buyerSession = await auth.issueSession(buyer.id);

    const dancer = await mkPerson("Dancer Plain", "DANCER");
    dancerId = dancer.id;
    dancerSession = await auth.issueSession(dancer.id);

    const producer = await mkPerson("Producer Serie", "PRODUCER");
    ids.producerId = producer.id;

    const payoutProducer = await mkPerson("Producer Payout", "PRODUCER");
    ids.payoutProducerId = payoutProducer.id;
    payoutProducerId = payoutProducer.id;
    payoutProducerSession = await auth.issueSession(payoutProducer.id);

    const otherProducer = await mkPerson("Producer Ajeno", "PRODUCER");
    ids.otherProducerId = otherProducer.id;

    // ─── venues / series / eventos ───
    // ownerId = payoutProducer → además de sus payouts PRODUCER y los
    // ACADEMY de su academia, ve los VENUE de su venue en me/payouts.
    const venue = await prisma.venue.create({
      data: {
        name: `Venue Gap Payments ${suffix}`,
        ownerId: payoutProducer.id,
      },
    });
    ids.venueId = venue.id;

    const base = {
      venueId: venue.id,
      status: "PUBLISHED" as const,
      startsAt: new Date(Date.now() + 24 * 3600 * 1000),
      endsAt: new Date(Date.now() + 28 * 3600 * 1000),
    };

    const series = await prisma.eventSeries.create({
      data: {
        name: `Serie Gap ${suffix}`,
        producerId: producer.id,
        venueId: venue.id,
        active: true,
      },
    });
    ids.seriesId = series.id;

    const inactive = await prisma.eventSeries.create({
      data: {
        name: `Serie Inactiva ${suffix}`,
        producerId: producer.id,
        venueId: venue.id,
        active: false,
      },
    });
    ids.inactiveSeriesId = inactive.id;

    const seriesEvent = await prisma.event.create({
      data: {
        ...base,
        name: `Evento de Serie ${suffix}`,
        seriesId: series.id,
        producerId: producer.id,
      },
    });
    ids.seriesEventId = seriesEvent.id;

    const payoutSeries = await prisma.eventSeries.create({
      data: {
        name: `Serie Payout ${suffix}`,
        producerId: payoutProducer.id,
        venueId: venue.id,
      },
    });
    ids.payoutSeriesId = payoutSeries.id;

    const payoutEvent = await prisma.event.create({
      data: {
        ...base,
        name: `Evento Payout ${suffix}`,
        producerId: payoutProducer.id,
      },
    });
    ids.payoutEventId = payoutEvent.id;

    const otherSeries = await prisma.eventSeries.create({
      data: {
        name: `Serie Ajena ${suffix}`,
        producerId: otherProducer.id,
        venueId: venue.id,
      },
    });
    ids.otherSeriesId = otherSeries.id;

    const otherEvent = await prisma.event.create({
      data: {
        ...base,
        name: `Evento Ajeno ${suffix}`,
        producerId: otherProducer.id,
      },
    });
    ids.otherEventId = otherEvent.id;

    // ─── academia + eventos para payouts ACADEMY/VENUE ───
    const academy = await prisma.academy.create({
      data: {
        name: `Academia Payout ${suffix}`,
        ownerId: payoutProducer.id,
      },
    });
    ids.academyId = academy.id;

    // Eventos de la academia SIN venue propio (venueId null para aislar el
    // settlement del venue): el sin-productor devenga a ACADEMY, el que
    // tiene productor no (el productor ya devenga).
    const academyEvent = await prisma.event.create({
      data: {
        ...base,
        venueId: null,
        name: `Gala Academia ${suffix}`,
        academyId: academy.id,
        producerId: null,
      },
    });
    ids.academyEventId = academyEvent.id;

    const academyProducedEvent = await prisma.event.create({
      data: {
        ...base,
        venueId: null,
        name: `Gala Academia Producida ${suffix}`,
        academyId: academy.id,
        producerId: otherProducer.id,
      },
    });
    ids.academyProducedEventId = academyProducedEvent.id;

    // Eventos del venue: el sin-productor devenga a VENUE; el que tiene
    // productor no. Los eventos ya creados (series/payout/other) tienen
    // venueId + producerId → quedan excluidos por la regla producerId=null.
    const venueEvent = await prisma.event.create({
      data: {
        ...base,
        name: `Social del Venue ${suffix}`,
        producerId: null,
      },
    });
    ids.venueEventId = venueEvent.id;

    const venueProducedEvent = await prisma.event.create({
      data: {
        ...base,
        name: `Social Venue Producido ${suffix}`,
        producerId: otherProducer.id,
      },
    });
    ids.venueProducedEventId = venueProducedEvent.id;
  });

  afterAll(async () => {
    const personIds = [
      buyerId,
      dancerId,
      ids.producerId,
      ids.payoutProducerId,
      ids.otherProducerId,
    ];
    const seriesIds = [
      ids.seriesId,
      ids.inactiveSeriesId,
      ids.payoutSeriesId,
      ids.otherSeriesId,
    ];
    const eventIds = [
      ids.seriesEventId,
      ids.payoutEventId,
      ids.otherEventId,
      ids.academyEventId,
      ids.academyProducedEventId,
      ids.venueEventId,
      ids.venueProducedEventId,
    ];

    await prisma.notification.deleteMany({
      where: { personId: { in: personIds } },
    });
    await prisma.seriesPass.deleteMany({
      where: { seriesId: { in: seriesIds } },
    });
    await prisma.payout.deleteMany({
      where: {
        actorId: {
          in: [
            ids.producerId,
            ids.payoutProducerId,
            ids.academyId,
            ids.venueId,
          ],
        },
      },
    });
    await prisma.auditLog.deleteMany({
      where: {
        OR: [
          { targetId: { in: ids.payoutIds } },
          { targetId: { in: ids.checkinIds } },
          { actorId: { in: personIds } },
        ],
      },
    });
    await prisma.payment.deleteMany({
      where: { personId: { in: personIds } },
    });
    await prisma.ticket.deleteMany({
      where: { eventId: { in: eventIds } },
    });
    await prisma.checkin.deleteMany({
      where: { eventId: { in: eventIds } },
    });
    await prisma.staffAssignment.deleteMany({
      where: { eventId: { in: eventIds } },
    });
    // restos de gamificación por los check-ins del test
    await prisma.pointLedger.deleteMany({
      where: { personId: { in: personIds } },
    });
    await prisma.personBadge.deleteMany({
      where: { personId: { in: personIds } },
    });
    await prisma.event.deleteMany({ where: { id: { in: eventIds } } });
    await prisma.eventSeries.deleteMany({ where: { id: { in: seriesIds } } });
    await prisma.academy.deleteMany({ where: { id: ids.academyId } });
    await prisma.personRole.deleteMany({
      where: { personId: { in: personIds } },
    });
    await prisma.person.deleteMany({ where: { id: { in: personIds } } });
    await prisma.venue.delete({ where: { id: ids.venueId } });
    await app.close();
  });

  // ────────────────────────────────────────────────────────────────────
  describe("POST /api/checkout/series-pass", () => {
    it("sin sesión → 401", async () => {
      const res = await post("/api/checkout/series-pass", {
        seriesId: ids.seriesId,
        month: MONTH,
      });
      expect(res.status).toBe(401);
    });

    it("month con formato inválido → 400", async () => {
      for (const month of ["2026-9", "septiembre", "2026-13"]) {
        const res = await post(
          "/api/checkout/series-pass",
          { seriesId: ids.seriesId, month },
          buyerSession,
        );
        expect(res.status).toBe(400);
      }
    });

    it("serie inexistente → 404", async () => {
      const res = await post(
        "/api/checkout/series-pass",
        { seriesId: "ser-ghost", month: MONTH },
        buyerSession,
      );
      expect(res.status).toBe(404);
    });

    it("serie inactiva → 400", async () => {
      const res = await post(
        "/api/checkout/series-pass",
        { seriesId: ids.inactiveSeriesId, month: MONTH },
        buyerSession,
      );
      expect(res.status).toBe(400);
    });

    it("checkout OK → 201 con paymentUrl stub, quote y Payment PENDING SERIES_PASS", async () => {
      const res = await post(
        "/api/checkout/series-pass",
        { seriesId: ids.seriesId, month: MONTH },
        buyerSession,
      );
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.paymentUrl).toMatch(/^stub:\/\/pay\//);
      expect(body.paymentId).toBeTruthy();
      expect(body.quote).toEqual({
        listPrice: 25000,
        discount: 0,
        serviceFee: 500,
        total: 25500,
      });

      const payment = await prisma.payment.findUniqueOrThrow({
        where: { id: body.paymentId },
      });
      expect(payment.status).toBe("PENDING");
      expect(payment.orderType).toBe("SERIES_PASS");
      expect(payment.personId).toBe(buyerId);
      expect(payment.eventId).toBeNull();
      expect(payment.discountCodeId).toBeNull();
      expect(payment.amount).toBe(25500);
      expect(payment.refId).toMatch(
        new RegExp(`^sp_${ids.seriesId}_${MONTH}_`),
      );
      expect(payment.gatewayRef).toBe(`stub-${payment.refId}`);
    });
  });

  // ────────────────────────────────────────────────────────────────────
  describe("webhook SERIES_PASS → emisión del pase", () => {
    let refId: string;
    let paymentId: string;

    it("webhook PAID → Payment PAID + SeriesPass upserted + notificación", async () => {
      const checkout = await post(
        "/api/checkout/series-pass",
        { seriesId: ids.seriesId, month: MONTH },
        buyerSession,
      );
      const { paymentId: pid } = await checkout.json();
      paymentId = pid;
      const payment = await prisma.payment.findUniqueOrThrow({
        where: { id: pid },
      });
      refId = payment.refId;

      const res = await post("/api/payments/webhook", {
        refId,
        status: "PAID",
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("PAID");

      const after = await prisma.payment.findUniqueOrThrow({
        where: { id: paymentId },
      });
      expect(after.status).toBe("PAID");

      const pass = await prisma.seriesPass.findUnique({
        where: {
          seriesId_personId_month: {
            seriesId: ids.seriesId,
            personId: buyerId,
            month: MONTH,
          },
        },
      });
      expect(pass).toBeTruthy();
      expect(pass!.price).toBe(25500);

      const notif = await prisma.notification.findFirst({
        where: { personId: buyerId, type: "payment.series_pass" },
      });
      expect(notif).toBeTruthy();
    });

    it("re-webhook PAID → idempotente, no duplica pase ni notificación", async () => {
      const res = await post("/api/payments/webhook", {
        refId,
        status: "PAID",
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.duplicated).toBe(true);

      const passes = await prisma.seriesPass.count({
        where: { seriesId: ids.seriesId, personId: buyerId },
      });
      expect(passes).toBe(1);
      const notifs = await prisma.notification.count({
        where: { personId: buyerId, type: "payment.series_pass" },
      });
      expect(notifs).toBe(1);
    });

    it("ya tiene el pase del mes → 409 en nuevo checkout", async () => {
      const res = await post(
        "/api/checkout/series-pass",
        { seriesId: ids.seriesId, month: MONTH },
        buyerSession,
      );
      expect(res.status).toBe(409);
    });

    it("otro mes → 201 (un pase por mes)", async () => {
      const d = new Date();
      d.setMonth(d.getMonth() + 1);
      const nextMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const res = await post(
        "/api/checkout/series-pass",
        { seriesId: ids.seriesId, month: nextMonth },
        buyerSession,
      );
      expect(res.status).toBe(201);
      const { paymentId: pid } = await res.json();
      // se paga para limpiar: queda PENDING — igual se borra en afterAll
      const payment = await prisma.payment.findUniqueOrThrow({
        where: { id: pid },
      });
      expect(payment.orderType).toBe("SERIES_PASS");
    });
  });

  // ────────────────────────────────────────────────────────────────────
  describe("check-in con SeriesPass", () => {
    it("persona con pase del mes → 201 passType SERIES_PASS, passId=pase, sin consumirlo", async () => {
      const pass = await prisma.seriesPass.findUniqueOrThrow({
        where: {
          seriesId_personId_month: {
            seriesId: ids.seriesId,
            personId: buyerId,
            month: MONTH,
          },
        },
      });
      const { token } = await qr.mint(buyerId);
      const res = await post(
        "/api/checkins",
        { qrToken: token, eventId: ids.seriesEventId },
        adminSession,
      );
      expect(res.status).toBe(201);
      const body = await res.json();
      ids.checkinIds.push(body.checkin.id);

      expect(body.passType).toBe("SERIES_PASS");
      expect(body.checkin.passId).toBe(pass.id);
      expect(body.ticket).toBeNull();
      expect(body.checkin.personId).toBe(buyerId);
    });

    it("persona sin pase → 201 igual pero passType null (check-in queda auditado)", async () => {
      const { token } = await qr.mint(dancerId);
      const res = await post(
        "/api/checkins",
        { qrToken: token, eventId: ids.seriesEventId },
        adminSession,
      );
      expect(res.status).toBe(201);
      const body = await res.json();
      ids.checkinIds.push(body.checkin.id);
      expect(body.passType).toBeNull();
      expect(body.checkin.passId).toBeNull();
    });
  });

  // ────────────────────────────────────────────────────────────────────
  describe("payouts", () => {
    const periodStart = new Date(Date.now() - 24 * 3600 * 1000);
    const periodEnd = new Date(Date.now() + 24 * 3600 * 1000);
    let payoutId: string;

    beforeAll(async () => {
      // Pagos PAID que devengan al payoutProducer (dentro del período):
      // ticket de su evento + pase de su serie (fee 200 para verificar net).
      await prisma.payment.create({
        data: {
          orderType: "TICKET",
          refId: `tkt_payout_${randomUUID()}`,
          personId: buyerId,
          eventId: ids.payoutEventId,
          amount: 10500,
          fee: 0,
          net: 10500,
          gateway: "STUB",
          status: "PAID",
        },
      });
      await prisma.payment.create({
        data: {
          orderType: "SERIES_PASS",
          refId: encodeSeriesPassRef(ids.payoutSeriesId, MONTH),
          personId: buyerId,
          amount: 25500,
          fee: 200,
          net: 25300,
          gateway: "STUB",
          status: "PAID",
        },
      });

      // ── decoys que NO deben devengar ──
      await prisma.payment.createMany({
        data: [
          {
            // ticket de evento de OTRO productor
            orderType: "TICKET",
            refId: `tkt_other_${randomUUID()}`,
            personId: buyerId,
            eventId: ids.otherEventId,
            amount: 9999,
            fee: 0,
            net: 9999,
            gateway: "STUB",
            status: "PAID",
          },
          {
            // pase de serie de OTRO productor
            orderType: "SERIES_PASS",
            refId: encodeSeriesPassRef(ids.otherSeriesId, MONTH),
            personId: buyerId,
            amount: 8888,
            fee: 0,
            net: 8888,
            gateway: "STUB",
            status: "PAID",
          },
          {
            // PENDING no cuenta
            orderType: "TICKET",
            refId: `tkt_pending_${randomUUID()}`,
            personId: buyerId,
            eventId: ids.payoutEventId,
            amount: 7777,
            fee: 0,
            net: 7777,
            gateway: "STUB",
            status: "PENDING",
          },
          {
            // fuera del período
            orderType: "TICKET",
            refId: `tkt_old_${randomUUID()}`,
            personId: buyerId,
            eventId: ids.payoutEventId,
            amount: 6666,
            fee: 0,
            net: 6666,
            gateway: "STUB",
            status: "PAID",
            createdAt: new Date(Date.now() - 30 * 24 * 3600 * 1000),
          },
          {
            // otro orderType no cuenta
            orderType: "MEMBERSHIP",
            refId: `mem_${randomUUID()}`,
            personId: buyerId,
            eventId: ids.payoutEventId,
            amount: 5555,
            fee: 0,
            net: 5555,
            gateway: "STUB",
            status: "PAID",
          },
        ],
      });
    });

    it("sin sesión → 401; sin admin.access → 403", async () => {
      const body = {
        actorType: "PRODUCER",
        actorId: ids.payoutProducerId,
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString(),
      };
      expect((await post("/api/admin/payouts/generate", body)).status).toBe(
        401,
      );
      expect(
        (await post("/api/admin/payouts/generate", body, dancerSession))
          .status,
      ).toBe(403);
    });

    it("actorType inválido → 400", async () => {
      const res = await post(
        "/api/admin/payouts/generate",
        {
          actorType: "DJ",
          actorId: ids.payoutProducerId,
          periodStart: periodStart.toISOString(),
          periodEnd: periodEnd.toISOString(),
        },
        adminSession,
      );
      expect(res.status).toBe(400);
    });

    it("generate → PENDING con gross=Σtickets+Σseries y net=gross−fees + audit", async () => {
      const res = await post(
        "/api/admin/payouts/generate",
        {
          actorType: "PRODUCER",
          actorId: ids.payoutProducerId,
          periodStart: periodStart.toISOString(),
          periodEnd: periodEnd.toISOString(),
        },
        adminSession,
      );
      expect(res.status).toBe(201);
      const body = await res.json();
      payoutId = body.id;
      ids.payoutIds.push(payoutId);

      expect(body.actorType).toBe("PRODUCER");
      expect(body.actorId).toBe(ids.payoutProducerId);
      expect(body.status).toBe("PENDING");
      // 10500 (ticket) + 25500 (series pass) = 36000; net = 36000 − 200 fee
      expect(body.gross).toBe(36000);
      expect(body.net).toBe(35800);

      const audit = await prisma.auditLog.findFirst({
        where: { action: "PAYOUT_GENERATE", targetId: payoutId },
      });
      expect(audit).toBeTruthy();
      expect(audit!.actorId).toBe(adminId);
    });

    it("generate idempotente → mismo payout, no duplica", async () => {
      const res = await post(
        "/api/admin/payouts/generate",
        {
          actorType: "PRODUCER",
          actorId: ids.payoutProducerId,
          periodStart: periodStart.toISOString(),
          periodEnd: periodEnd.toISOString(),
        },
        adminSession,
      );
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.id).toBe(payoutId);

      const count = await prisma.payout.count({
        where: { actorId: ids.payoutProducerId },
      });
      expect(count).toBe(1);
    });

    it("pay desde PENDING → 409", async () => {
      const res = await post(
        `/api/admin/payouts/${payoutId}/pay`,
        {},
        adminSession,
      );
      expect(res.status).toBe(409);
    });

    it("approve → APPROVED + audit", async () => {
      const res = await post(
        `/api/admin/payouts/${payoutId}/approve`,
        {},
        adminSession,
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("APPROVED");

      const audit = await prisma.auditLog.findFirst({
        where: { action: "PAYOUT_APPROVE", targetId: payoutId },
      });
      expect(audit).toBeTruthy();
    });

    it("pay con evidenceUrl → PAID + paidAt + audit", async () => {
      const res = await post(
        `/api/admin/payouts/${payoutId}/pay`,
        { evidenceUrl: "https://drive.example.com/comprobante.pdf" },
        adminSession,
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("PAID");
      expect(body.paidAt).toBeTruthy();
      expect(body.evidenceUrl).toBe(
        "https://drive.example.com/comprobante.pdf",
      );

      const audit = await prisma.auditLog.findFirst({
        where: { action: "PAYOUT_PAY", targetId: payoutId },
      });
      expect(audit).toBeTruthy();
    });

    it("pay desde PAID → 409", async () => {
      const res = await post(
        `/api/admin/payouts/${payoutId}/pay`,
        {},
        adminSession,
      );
      expect(res.status).toBe(409);
    });

    it("GET /admin/payouts filtra por actorType y status", async () => {
      const res = await get(
        "/api/admin/payouts?actorType=PRODUCER&status=PAID",
        adminSession,
      );
      expect(res.status).toBe(200);
      const list = await res.json();
      const mine = list.find((p: { id: string }) => p.id === payoutId);
      expect(mine).toBeTruthy();

      const pending = await get(
        "/api/admin/payouts?status=PENDING",
        adminSession,
      );
      const pendingList = await pending.json();
      expect(
        pendingList.some((p: { id: string }) => p.id === payoutId),
      ).toBe(false);
    });

    it("GET /me/payouts → solo los payouts del productor autenticado", async () => {
      // un payout de OTRO productor para verificar aislamiento
      const other = await post(
        "/api/admin/payouts/generate",
        {
          actorType: "PRODUCER",
          actorId: ids.producerId,
          periodStart: periodStart.toISOString(),
          periodEnd: periodEnd.toISOString(),
        },
        adminSession,
      );
      const otherPayout = await other.json();
      ids.payoutIds.push(otherPayout.id);

      const res = await get("/api/me/payouts", payoutProducerSession);
      expect(res.status).toBe(200);
      const list = await res.json();
      expect(list.length).toBeGreaterThan(0);
      expect(
        list.every(
          (p: { actorType: string; actorId: string }) =>
            p.actorType === "PRODUCER" &&
            p.actorId === ids.payoutProducerId,
        ),
      ).toBe(true);
      expect(list.some((p: { id: string }) => p.id === payoutId)).toBe(true);
      expect(list.some((p: { id: string }) => p.id === otherPayout.id)).toBe(
        false,
      );
    });

    it("me/payouts sin crm.manage → 403; sin sesión → 401", async () => {
      expect((await get("/api/me/payouts", dancerSession)).status).toBe(403);
      expect((await get("/api/me/payouts")).status).toBe(401);
    });
  });

  // ────────────────────────────────────────────────────────────────────
  describe("payouts ACADEMY / VENUE", () => {
    const periodStart = new Date(Date.now() - 24 * 3600 * 1000);
    const periodEnd = new Date(Date.now() + 24 * 3600 * 1000);
    let academyPayoutId: string;
    let venuePayoutId: string;

    beforeAll(async () => {
      await prisma.payment.createMany({
        data: [
          {
            // ticket PAID del evento de la academia sin productor → devenga
            orderType: "TICKET",
            refId: `tkt_acad_${randomUUID()}`,
            personId: buyerId,
            eventId: ids.academyEventId,
            amount: 7000,
            fee: 100,
            net: 6900,
            gateway: "STUB",
            status: "PAID",
          },
          {
            // evento de la academia CON productor → no devenga a ACADEMY
            orderType: "TICKET",
            refId: `tkt_acadprod_${randomUUID()}`,
            personId: buyerId,
            eventId: ids.academyProducedEventId,
            amount: 9999,
            fee: 0,
            net: 9999,
            gateway: "STUB",
            status: "PAID",
          },
          {
            // PENDING sobre el evento de la academia → no cuenta
            orderType: "TICKET",
            refId: `tkt_acad_pend_${randomUUID()}`,
            personId: buyerId,
            eventId: ids.academyEventId,
            amount: 5555,
            fee: 0,
            net: 5555,
            gateway: "STUB",
            status: "PENDING",
          },
          {
            // orderType no-TICKET sobre el evento → no cuenta
            orderType: "SERIES_PASS",
            refId: `sp_acad_${randomUUID()}`,
            personId: buyerId,
            eventId: ids.academyEventId,
            amount: 4444,
            fee: 0,
            net: 4444,
            gateway: "STUB",
            status: "PAID",
          },
          {
            // ticket PAID del evento del venue sin productor → devenga
            orderType: "TICKET",
            refId: `tkt_venue_${randomUUID()}`,
            personId: buyerId,
            eventId: ids.venueEventId,
            amount: 4000,
            fee: 50,
            net: 3950,
            gateway: "STUB",
            status: "PAID",
          },
          {
            // evento del venue CON productor → no devenga a VENUE
            orderType: "TICKET",
            refId: `tkt_venueprod_${randomUUID()}`,
            personId: buyerId,
            eventId: ids.venueProducedEventId,
            amount: 8888,
            fee: 0,
            net: 8888,
            gateway: "STUB",
            status: "PAID",
          },
        ],
      });
    });

    it("generate ACADEMY → solo tickets de eventos academyId + producerId null", async () => {
      const res = await post(
        "/api/admin/payouts/generate",
        {
          actorType: "ACADEMY",
          actorId: ids.academyId,
          periodStart: periodStart.toISOString(),
          periodEnd: periodEnd.toISOString(),
        },
        adminSession,
      );
      expect(res.status).toBe(201);
      const body = await res.json();
      academyPayoutId = body.id;
      ids.payoutIds.push(academyPayoutId);

      expect(body.actorType).toBe("ACADEMY");
      expect(body.actorId).toBe(ids.academyId);
      // solo el ticket de 7000 (fee 100): excluye evento con productor,
      // PENDING y orderType != TICKET
      expect(body.gross).toBe(7000);
      expect(body.net).toBe(6900);
    });

    it("generate VENUE → mismo patrón con venueId + producerId null", async () => {
      const res = await post(
        "/api/admin/payouts/generate",
        {
          actorType: "VENUE",
          actorId: ids.venueId,
          periodStart: periodStart.toISOString(),
          periodEnd: periodEnd.toISOString(),
        },
        adminSession,
      );
      expect(res.status).toBe(201);
      const body = await res.json();
      venuePayoutId = body.id;
      ids.payoutIds.push(venuePayoutId);

      expect(body.actorType).toBe("VENUE");
      expect(body.actorId).toBe(ids.venueId);
      // solo el ticket de 4000 (fee 50): los demás eventos del venue
      // tienen productor y quedan excluidos
      expect(body.gross).toBe(4000);
      expect(body.net).toBe(3950);
    });

    it("me/payouts del owner incluye los payouts ACADEMY de sus academias", async () => {
      const res = await get("/api/me/payouts", payoutProducerSession);
      expect(res.status).toBe(200);
      const list = await res.json();

      const academyPayout = list.find(
        (p: { id: string }) => p.id === academyPayoutId,
      );
      expect(academyPayout).toBeTruthy();
      expect(academyPayout.actorType).toBe("ACADEMY");
      expect(academyPayout.actorId).toBe(ids.academyId);

      // sus payouts PRODUCER siguen apareciendo
      expect(
        list.some(
          (p: { actorType: string; actorId: string }) =>
            p.actorType === "PRODUCER" &&
            p.actorId === ids.payoutProducerId,
        ),
      ).toBe(true);

      // todo lo listado es suyo: PRODUCER propio, ACADEMY de su academia
      // o VENUE de su venue
      expect(
        list.every(
          (p: { actorType: string; actorId: string }) =>
            (p.actorType === "PRODUCER" &&
              p.actorId === ids.payoutProducerId) ||
            (p.actorType === "ACADEMY" && p.actorId === ids.academyId) ||
            (p.actorType === "VENUE" && p.actorId === ids.venueId),
        ),
      ).toBe(true);
    });

    it("me/payouts del owner incluye el payout VENUE de su venue", async () => {
      const res = await get("/api/me/payouts", payoutProducerSession);
      expect(res.status).toBe(200);
      const list = await res.json();

      const venuePayout = list.find(
        (p: { id: string }) => p.id === venuePayoutId,
      );
      expect(venuePayout).toBeTruthy();
      expect(venuePayout.actorType).toBe("VENUE");
      expect(venuePayout.actorId).toBe(ids.venueId);
    });

    it("me/payouts de un productor sin academias ni venues NO incluye payouts ACADEMY/VENUE ajenos", async () => {
      const otherSession = await auth.issueSession(ids.producerId);
      const res = await get("/api/me/payouts", otherSession);
      expect(res.status).toBe(200);
      const list = await res.json();
      expect(
        list.some((p: { id: string }) => p.id === academyPayoutId),
      ).toBe(false);
      expect(
        list.some((p: { id: string }) => p.id === venuePayoutId),
      ).toBe(false);
      // no posee venues → ningún payout VENUE puede aparecer en su lista
      expect(
        list.some((p: { actorType: string }) => p.actorType === "VENUE"),
      ).toBe(false);
    });
  });
});
