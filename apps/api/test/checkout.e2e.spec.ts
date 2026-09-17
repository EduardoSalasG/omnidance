import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Test } from "@nestjs/testing";
import { ValidationPipe, type INestApplication } from "@nestjs/common";
import { PaymentsModule } from "../src/payments/payments.module";
import { AuthModule } from "../src/auth/auth.module";
import { AuthService } from "../src/auth/domain/auth.service";
import { PrismaService } from "../src/prisma.service";

describe("checkout + payments e2e", () => {
  let app: INestApplication;
  let baseUrl: string;
  let prisma: PrismaService;
  const auth = new AuthService(
    process.env.JWT_SECRET ?? "dev-secret-change-me",
  );

  let buyerId: string;
  let otherId: string;
  let buyerSession: string;
  let otherSession: string;

  const suffix = Date.now().toString(36);
  const ids = {
    venueId: "",
    eventId: "", // PUBLISHED con preventa
    draftId: "", // DRAFT con precio
    noPresaleId: "", // PUBLISHED sin presalePrice
    cappedId: "", // PUBLISHED presaleCap agotado
    otherEventId: "", // para código con scope de otro evento
  };
  const codeIds: string[] = [];

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
      imports: [PaymentsModule, AuthModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api");
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    await app.listen(0);
    prisma = app.get(PrismaService);
    const address = app.getHttpServer().address();
    baseUrl = `http://127.0.0.1:${address.port}`;

    // ─── datos de prueba ───
    const venue = await prisma.venue.create({
      data: { name: `Venue Checkout Test ${suffix}` },
    });
    ids.venueId = venue.id;

    const base = {
      venueId: venue.id,
      startsAt: new Date(Date.now() + 24 * 3600 * 1000),
      endsAt: new Date(Date.now() + 28 * 3600 * 1000),
    };
    const [event, draft, noPresale, capped, otherEvent] = await Promise.all([
      prisma.event.create({
        data: {
          ...base,
          name: `Social Checkout ${suffix}`,
          status: "PUBLISHED",
          presalePrice: 10000,
          presaleCap: 10,
        },
      }),
      prisma.event.create({
        data: {
          ...base,
          name: `Draft Checkout ${suffix}`,
          status: "DRAFT",
          presalePrice: 10000,
        },
      }),
      prisma.event.create({
        data: { ...base, name: `Sin Preventa ${suffix}`, status: "PUBLISHED" },
      }),
      prisma.event.create({
        data: {
          ...base,
          name: `Capped ${suffix}`,
          status: "PUBLISHED",
          presalePrice: 5000,
          presaleCap: 1,
        },
      }),
      prisma.event.create({
        data: {
          ...base,
          name: `Otro Evento ${suffix}`,
          status: "PUBLISHED",
          presalePrice: 8000,
        },
      }),
    ]);
    ids.eventId = event.id;
    ids.draftId = draft.id;
    ids.noPresaleId = noPresale.id;
    ids.cappedId = capped.id;
    ids.otherEventId = otherEvent.id;

    // cap agotado: ya hay un ticket emitido
    await prisma.ticket.create({
      data: {
        eventId: capped.id,
        ownerId: "alguien",
        buyerId: "alguien",
        listPrice: 5000,
        serviceFee: 400,
      },
    });

    const buyer = await prisma.person.create({
      data: {
        name: "Comprador E2E",
        email: `buyer-${suffix}@test.cl`,
        roles: { create: [{ role: "DANCER", status: "APPROVED" }] },
      },
    });
    const other = await prisma.person.create({
      data: {
        name: "Otro E2E",
        email: `other-${suffix}@test.cl`,
        roles: { create: [{ role: "DANCER", status: "APPROVED" }] },
      },
    });
    buyerId = buyer.id;
    otherId = other.id;
    buyerSession = await auth.issueSession(buyerId);
    otherSession = await auth.issueSession(otherId);
  });

  afterAll(async () => {
    await prisma.discountRedemption.deleteMany({
      where: { codeId: { in: codeIds } },
    });
    await prisma.discountCode.deleteMany({ where: { id: { in: codeIds } } });
    await prisma.ticket.deleteMany({
      where: {
        eventId: {
          in: [
            ids.eventId,
            ids.draftId,
            ids.noPresaleId,
            ids.cappedId,
            ids.otherEventId,
          ],
        },
      },
    });
    await prisma.payment.deleteMany({
      where: { personId: { in: [buyerId, otherId] } },
    });
    await prisma.event.deleteMany({
      where: {
        id: {
          in: [
            ids.eventId,
            ids.draftId,
            ids.noPresaleId,
            ids.cappedId,
            ids.otherEventId,
          ],
        },
      },
    });
    await prisma.venue.delete({ where: { id: ids.venueId } });
    await prisma.personRole.deleteMany({
      where: { personId: { in: [buyerId, otherId] } },
    });
    await prisma.person.deleteMany({ where: { id: { in: [buyerId, otherId] } } });
    await app.close();
  });

  const makeCode = (data: {
    code: string;
    eventId?: string;
    percentOff?: number;
    amountOff?: number;
    maxUses?: number;
    usedCount?: number;
    expiresAt?: Date;
  }) =>
    prisma.discountCode
      .create({
        data: {
          type: "CAMPAIGN",
          createdById: buyerId,
          ...data,
        },
      })
      .then((c) => {
        codeIds.push(c.id);
        return c;
      });

  describe("POST /api/checkout/ticket", () => {
    it("sin sesión → 401", async () => {
      const res = await post("/api/checkout/ticket", {
        eventId: ids.eventId,
      });
      expect(res.status).toBe(401);
    });

    it("evento inexistente → 404", async () => {
      const res = await post(
        "/api/checkout/ticket",
        { eventId: "evt-no-existe" },
        buyerSession,
      );
      expect(res.status).toBe(404);
    });

    it("evento no PUBLISHED → 400", async () => {
      const res = await post(
        "/api/checkout/ticket",
        { eventId: ids.draftId },
        buyerSession,
      );
      expect(res.status).toBe(400);
    });

    it("evento sin presalePrice → 400", async () => {
      const res = await post(
        "/api/checkout/ticket",
        { eventId: ids.noPresaleId },
        buyerSession,
      );
      expect(res.status).toBe(400);
    });

    it("checkout OK → 201 con paymentUrl stub, quote y Payment PENDING", async () => {
      const res = await post(
        "/api/checkout/ticket",
        { eventId: ids.eventId },
        buyerSession,
      );
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.paymentUrl).toMatch(/^stub:\/\/pay\//);
      expect(body.paymentId).toBeTruthy();
      expect(body.quote).toEqual({
        listPrice: 10000,
        discount: 0,
        serviceFee: 800,
        total: 10800,
      });
      const payment = await prisma.payment.findUniqueOrThrow({
        where: { id: body.paymentId },
      });
      expect(payment.status).toBe("PENDING");
      expect(payment.orderType).toBe("TICKET");
      expect(payment.personId).toBe(buyerId);
      expect(payment.amount).toBe(10800);
      expect(payment.gatewayRef).toBe(`stub-${payment.refId}`);
    });
  });

  describe("discount codes", () => {
    it("código inexistente → 400", async () => {
      const res = await post(
        "/api/checkout/ticket",
        { eventId: ids.eventId, discountCode: "NOEXISTE" },
        buyerSession,
      );
      expect(res.status).toBe(400);
    });

    it("código expirado → 400", async () => {
      const code = await makeCode({
        code: `EXP-${suffix}`,
        eventId: ids.eventId,
        percentOff: 50,
        expiresAt: new Date(Date.now() - 1000),
      });
      const res = await post(
        "/api/checkout/ticket",
        { eventId: ids.eventId, discountCode: code.code },
        buyerSession,
      );
      expect(res.status).toBe(400);
    });

    it("código de otro evento → 400", async () => {
      const code = await makeCode({
        code: `OTRO-${suffix}`,
        eventId: ids.otherEventId,
        percentOff: 50,
      });
      const res = await post(
        "/api/checkout/ticket",
        { eventId: ids.eventId, discountCode: code.code },
        buyerSession,
      );
      expect(res.status).toBe(400);
    });

    it("código con maxUses agotado → 400", async () => {
      const code = await makeCode({
        code: `FULL-${suffix}`,
        eventId: ids.eventId,
        percentOff: 50,
        maxUses: 2,
        usedCount: 2,
      });
      const res = await post(
        "/api/checkout/ticket",
        { eventId: ids.eventId, discountCode: code.code },
        buyerSession,
      );
      expect(res.status).toBe(400);
    });
  });

  describe("preventa agotada", () => {
    it("presaleCap alcanzado → 409", async () => {
      const res = await post(
        "/api/checkout/ticket",
        { eventId: ids.cappedId },
        buyerSession,
      );
      expect(res.status).toBe(409);
    });
  });

  describe("webhook + emisión de ticket", () => {
    let paymentId: string;
    let refId: string;
    let promoCodeId: string;

    it("checkout con código válido aplica descuento en el quote", async () => {
      const code = await makeCode({
        code: `PROMO-${suffix}`,
        eventId: ids.eventId,
        percentOff: 20,
      });
      promoCodeId = code.id;
      const res = await post(
        "/api/checkout/ticket",
        { eventId: ids.eventId, discountCode: code.code },
        buyerSession,
      );
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.quote).toEqual({
        listPrice: 10000,
        discount: 2000,
        serviceFee: 640, // 8% de 8000
        total: 8640,
      });
      paymentId = body.paymentId;
      const payment = await prisma.payment.findUniqueOrThrow({
        where: { id: paymentId },
      });
      refId = payment.refId;
    });

    it("webhook PAID → 200: Payment PAID + Ticket ACTIVE + redemption + usedCount=1", async () => {
      const res = await post("/api/payments/webhook", {
        refId,
        status: "PAID",
      });
      expect(res.status).toBe(200);

      const payment = await prisma.payment.findUniqueOrThrow({
        where: { id: paymentId },
      });
      expect(payment.status).toBe("PAID");

      const ticket = await prisma.ticket.findFirstOrThrow({
        where: { eventId: ids.eventId, ownerId: buyerId },
      });
      expect(ticket.status).toBe("ACTIVE");
      expect(ticket.buyerId).toBe(buyerId);
      expect(ticket.listPrice).toBe(10000);
      expect(ticket.serviceFee).toBe(640);
      expect(ticket.discountCodeId).toBe(promoCodeId);

      const redemption = await prisma.discountRedemption.findFirstOrThrow({
        where: { paymentId },
      });
      expect(redemption.codeId).toBe(promoCodeId);
      expect(redemption.personId).toBe(buyerId);

      const code = await prisma.discountCode.findUniqueOrThrow({
        where: { id: promoCodeId },
      });
      expect(code.usedCount).toBe(1);
    });

    it("re-webhook PAID → 200 idempotente, no duplica ticket ni usedCount", async () => {
      const res = await post("/api/payments/webhook", {
        refId,
        status: "PAID",
      });
      expect(res.status).toBe(200);

      const tickets = await prisma.ticket.count({
        where: { eventId: ids.eventId, ownerId: buyerId },
      });
      expect(tickets).toBe(1);
      const code = await prisma.discountCode.findUniqueOrThrow({
        where: { id: promoCodeId },
      });
      expect(code.usedCount).toBe(1);
      const redemptions = await prisma.discountRedemption.count({
        where: { paymentId },
      });
      expect(redemptions).toBe(1);
    });

    it("webhook FAILED → Payment FAILED, sin ticket", async () => {
      const res = await post(
        "/api/checkout/ticket",
        { eventId: ids.eventId },
        otherSession,
      );
      const { paymentId: pid } = await res.json();
      const payment = await prisma.payment.findUniqueOrThrow({
        where: { id: pid },
      });
      const wh = await post("/api/payments/webhook", {
        refId: payment.refId,
        status: "FAILED",
      });
      expect(wh.status).toBe(200);
      const after = await prisma.payment.findUniqueOrThrow({
        where: { id: pid },
      });
      expect(after.status).toBe("FAILED");
      const tickets = await prisma.ticket.count({
        where: { eventId: ids.eventId, ownerId: otherId },
      });
      expect(tickets).toBe(0);
    });

    it("webhook con refId desconocido → 404", async () => {
      const res = await post("/api/payments/webhook", {
        refId: "tkt_nada_ninguno_x",
        status: "PAID",
      });
      expect(res.status).toBe(404);
    });

    it("webhook con body inválido → 400", async () => {
      const res = await post("/api/payments/webhook", { foo: 1 });
      expect(res.status).toBe(400);
    });
  });

  describe("GET /api/tickets/mine", () => {
    it("sin sesión → 401", async () => {
      const res = await get("/api/tickets/mine");
      expect(res.status).toBe(401);
    });

    it("lista mis tickets con evento {id,name,startsAt,venue{name}}", async () => {
      const res = await get("/api/tickets/mine", buyerSession);
      expect(res.status).toBe(200);
      const list = await res.json();
      expect(Array.isArray(list)).toBe(true);
      const t = list.find(
        (x: { event: { id: string } }) => x.event.id === ids.eventId,
      );
      expect(t).toBeTruthy();
      expect(t.status).toBe("ACTIVE");
      expect(t.listPrice).toBe(10000);
      expect(t.event.name).toContain("Social Checkout");
      expect(t.event.venue.name).toContain("Venue Checkout Test");
      expect(t.event.startsAt).toBeTruthy();
    });

    it("no devuelve tickets ajenos", async () => {
      const res = await get("/api/tickets/mine", otherSession);
      const list = await res.json();
      expect(
        list.every(
          (t: { event: { id: string } }) => t.event.id !== ids.eventId,
        ),
      ).toBe(true);
    });
  });

  describe("GET /api/payments/:id", () => {
    it("sin sesión → 401", async () => {
      const res = await get("/api/payments/cualquiera");
      expect(res.status).toBe(401);
    });

    it("dueño consulta su pago → estado", async () => {
      const payment = await prisma.payment.findFirstOrThrow({
        where: { personId: buyerId, status: "PAID" },
      });
      const res = await get(`/api/payments/${payment.id}`, buyerSession);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.id).toBe(payment.id);
      expect(body.status).toBe("PAID");
      expect(body.orderType).toBe("TICKET");
      expect(body.amount).toBe(8640);
    });

    it("pago ajeno → 404", async () => {
      const payment = await prisma.payment.findFirstOrThrow({
        where: { personId: buyerId },
      });
      const res = await get(`/api/payments/${payment.id}`, otherSession);
      expect(res.status).toBe(404);
    });
  });
});
