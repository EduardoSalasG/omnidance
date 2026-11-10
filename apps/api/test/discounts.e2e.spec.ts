import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Test } from "@nestjs/testing";
import { ValidationPipe, type INestApplication } from "@nestjs/common";
import { AuthModule } from "../src/auth/auth.module";
import { AuthService } from "../src/auth/domain/auth.service";
import { DiscountsModule } from "../src/discounts/discounts.module";
import { PrismaService } from "../src/prisma.service";
import { deletePeople } from "./helpers";

describe("discounts e2e", () => {
  let app: INestApplication;
  let baseUrl: string;
  let prisma: PrismaService;
  const auth = new AuthService(
    process.env.JWT_SECRET ?? "dev-secret-change-me",
  );

  let adminSession: string;
  let producerSession: string;
  let dancerSession: string;
  let adminId: string;

  const ids = {
    venueId: "",
    eventId: "",
    otherEventId: "",
    producerId: "",
    dancerId: "",
    redeemerId: "",
    codeIds: [] as string[],
    redemptionIds: [] as string[],
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
      imports: [DiscountsModule, AuthModule],
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
    const admin = await prisma.person.findFirstOrThrow({
      where: { email: "admin@omnidance.dev" },
    });
    adminId = admin.id;
    adminSession = await auth.issueSession(admin.id);

    const producer = await prisma.person.create({
      data: {
        name: "Productora Test",
        roles: { create: [{ role: "PRODUCER", status: "APPROVED" }] },
      },
    });
    ids.producerId = producer.id;
    producerSession = await auth.issueSession(producer.id);

    const dancer = await prisma.person.create({
      data: {
        name: "Bailarín Test",
        roles: { create: [{ role: "DANCER", status: "APPROVED" }] },
      },
    });
    ids.dancerId = dancer.id;
    dancerSession = await auth.issueSession(dancer.id);

    const redeemer = await prisma.person.create({
      data: { name: "Redentor Test" },
    });
    ids.redeemerId = redeemer.id;

    const venue = await prisma.venue.create({
      data: { name: "Venue Discounts Test" },
    });
    ids.venueId = venue.id;

    const event = await prisma.event.create({
      data: {
        venueId: venue.id,
        producerId: producer.id,
        name: "Evento Discounts Test",
        status: "PUBLISHED",
        startsAt: new Date(),
        endsAt: new Date(Date.now() + 4 * 3600 * 1000),
      },
    });
    ids.eventId = event.id;

    // Evento de OTRO dueño para el negativo de scoping (spec
    // event-access-scope): el producer del test no es su producerId.
    const other = await prisma.event.create({
      data: {
        venueId: venue.id,
        producerId: admin.id,
        name: "Evento Discounts Ajeno",
        status: "PUBLISHED",
        startsAt: new Date(),
        endsAt: new Date(Date.now() + 4 * 3600 * 1000),
      },
    });
    ids.otherEventId = other.id;
  });

  afterAll(async () => {
    await prisma.discountRedemption.deleteMany({
      where: { id: { in: ids.redemptionIds } },
    });
    await prisma.discountCode.deleteMany({
      where: { id: { in: ids.codeIds } },
    });
    await prisma.event.deleteMany({
      where: { id: { in: [ids.eventId, ids.otherEventId] } },
    });
    await prisma.venue.delete({ where: { id: ids.venueId } });
    await prisma.personRole.deleteMany({
      where: { personId: { in: [ids.producerId, ids.dancerId] } },
    });
    await deletePeople(prisma, [ids.producerId, ids.dancerId, ids.redeemerId]);
    await app.close();
  });

  describe("POST /api/discount-codes", () => {
    it("sin sesión → 401", async () => {
      const res = await post("/api/discount-codes", {
        code: "X",
        type: "CAMPAIGN",
        percentOff: 10,
      });
      expect(res.status).toBe(401);
    });

    it("sesión sin rol PRODUCER/ADMIN → 403", async () => {
      const res = await post(
        "/api/discount-codes",
        { code: "X", type: "CAMPAIGN", percentOff: 10 },
        dancerSession,
      );
      expect(res.status).toBe(403);
    });

    it("type fuera del enum → 400", async () => {
      const res = await post(
        "/api/discount-codes",
        { code: "X", type: "GRATIS", percentOff: 10 },
        adminSession,
      );
      expect(res.status).toBe(400);
    });

    it("sin percentOff ni amountOff → 400", async () => {
      const res = await post(
        "/api/discount-codes",
        { code: "X", type: "CAMPAIGN" },
        adminSession,
      );
      expect(res.status).toBe(400);
    });

    it("percentOff y amountOff juntos → 400", async () => {
      const res = await post(
        "/api/discount-codes",
        { code: "X", type: "CAMPAIGN", percentOff: 10, amountOff: 500 },
        adminSession,
      );
      expect(res.status).toBe(400);
    });

    it("percentOff fuera de rango → 400", async () => {
      const res = await post(
        "/api/discount-codes",
        { code: "X", type: "CAMPAIGN", percentOff: 150 },
        adminSession,
      );
      expect(res.status).toBe(400);
    });

    it("ADMIN crea código válido → 201 con tracking (createdById, type, cupo)", async () => {
      const res = await post(
        "/api/discount-codes",
        {
          code: "CUMPLE-E2E",
          type: "CUMPLEANOS",
          percentOff: 50,
          eventId: ids.eventId,
          maxUses: 10,
          expiresAt: "2030-01-01T00:00:00.000Z",
        },
        adminSession,
      );
      expect(res.status).toBe(201);
      const body = await res.json();
      ids.codeIds.push(body.id);
      expect(body.code).toBe("CUMPLE-E2E");
      expect(body.type).toBe("CUMPLEANOS");
      expect(body.createdById).toBe(adminId);
      expect(body.eventId).toBe(ids.eventId);
      expect(body.percentOff).toBe(50);
      expect(body.amountOff).toBeNull();
      expect(body.maxUses).toBe(10);
      expect(body.usedCount).toBe(0);
    });

    it("PRODUCER también puede crear → 201", async () => {
      const res = await post(
        "/api/discount-codes",
        { code: "PROD-TEST", type: "CASO_BORDE_PUERTA", amountOff: 2000 },
        producerSession,
      );
      expect(res.status).toBe(201);
      const body = await res.json();
      ids.codeIds.push(body.id);
      expect(body.createdById).toBe(ids.producerId);
      expect(body.amountOff).toBe(2000);
      expect(body.percentOff).toBeNull();
    });

    it("code duplicado → 409", async () => {
      const res = await post(
        "/api/discount-codes",
        { code: "CUMPLE-E2E", type: "CAMPAIGN", percentOff: 5 },
        adminSession,
      );
      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.error).toBe("DUPLICATE_DISCOUNT_CODE");
    });

    it("PRODUCER scoped a su evento → 201 (spec event-access-scope)", async () => {
      const res = await post(
        "/api/discount-codes",
        {
          code: "PROD-EVT",
          type: "CAMPAIGN",
          percentOff: 10,
          eventId: ids.eventId,
        },
        producerSession,
      );
      expect(res.status).toBe(201);
      const body = await res.json();
      ids.codeIds.push(body.id);
      expect(body.eventId).toBe(ids.eventId);
      expect(body.createdById).toBe(ids.producerId);
    });

    it("PRODUCER scoped a evento ajeno → 403 y no persiste", async () => {
      const res = await post(
        "/api/discount-codes",
        {
          code: "PROD-AJENO",
          type: "CAMPAIGN",
          percentOff: 10,
          eventId: ids.otherEventId,
        },
        producerSession,
      );
      expect(res.status).toBe(403);
      const saved = await prisma.discountCode.findUnique({
        where: { code: "PROD-AJENO" },
      });
      expect(saved).toBeNull();
    });
  });

  describe("GET /api/discount-codes", () => {
    it("lista códigos con campos de tracking, createdAt desc", async () => {
      const res = await get("/api/discount-codes", adminSession);
      expect(res.status).toBe(200);
      const { items: list, total } = await res.json();
      expect(Array.isArray(list)).toBe(true);
      expect(total).toBeGreaterThanOrEqual(2);
      const ours = list.filter((c: { id: string }) =>
        ids.codeIds.includes(c.id),
      );
      expect(ours.length).toBe(3);
      // CUMPLE-E2E se creó primero → PROD-EVT (más nuevo) va antes
      expect(ours[0].code).toBe("PROD-EVT");
      expect(ours[1].code).toBe("PROD-TEST");
      expect(ours[1]).toMatchObject({
        type: "CASO_BORDE_PUERTA",
        usedCount: 0,
        maxUses: null,
      });
      expect(ours[2]).toMatchObject({
        code: "CUMPLE-E2E",
        type: "CUMPLEANOS",
        usedCount: 0,
        maxUses: 10,
      });
      expect(ours[2].expiresAt).toBeTruthy();
    });

    it("filtra por eventId", async () => {
      const res = await get(
        `/api/discount-codes?eventId=${ids.eventId}`,
        adminSession,
      );
      expect(res.status).toBe(200);
      const list = (await res.json()).items;
      const ours = list.filter((c: { id: string }) =>
        ids.codeIds.includes(c.id),
      );
      // Los dos códigos scoped a este evento: CUMPLE-E2E (admin) y PROD-EVT.
      expect(ours.map((c: { code: string }) => c.code).sort()).toEqual([
        "CUMPLE-E2E",
        "PROD-EVT",
      ]);
    });

    it("filtro por seriesId sin matches → lista vacía", async () => {
      const res = await get(
        "/api/discount-codes?seriesId=ser-inexistente",
        adminSession,
      );
      expect(res.status).toBe(200);
      expect((await res.json()).items).toEqual([]);
    });

    it("sin sesión → 401", async () => {
      const res = await get("/api/discount-codes");
      expect(res.status).toBe(401);
    });

    it("sin rol PRODUCER/ADMIN → 403", async () => {
      const res = await get("/api/discount-codes", dancerSession);
      expect(res.status).toBe(403);
    });

    it("PRODUCER no ve códigos de otros actores (spec event-access-scope)", async () => {
      const res = await get("/api/discount-codes", producerSession);
      expect(res.status).toBe(200);
      const { items } = await res.json();
      // Solo los suyos (PROD-TEST, PROD-EVT) - nunca CUMPLE-E2E del admin.
      expect(
        items.every(
          (c: { code: string }) => !["CUMPLE-E2E"].includes(c.code),
        ),
      ).toBe(true);
      const ours = items.filter((c: { id: string }) =>
        ids.codeIds.includes(c.id),
      );
      expect(ours.map((c: { code: string }) => c.code).sort()).toEqual([
        "PROD-EVT",
        "PROD-TEST",
      ]);
    });

    it("PRODUCER no ve detail ni redemptions de código ajeno → 404", async () => {
      const res = await get(
        `/api/discount-codes/${ids.codeIds[0]}`,
        producerSession,
      );
      expect(res.status).toBe(404);
      const red = await get(
        `/api/discount-codes/${ids.codeIds[0]}/redemptions`,
        producerSession,
      );
      expect(red.status).toBe(404);
    });
  });

  describe("GET /api/discount-codes/:id/redemptions", () => {
    it("código inexistente → 404", async () => {
      const res = await get(
        "/api/discount-codes/dc-fantasma/redemptions",
        adminSession,
      );
      expect(res.status).toBe(404);
    });

    it("lista redemptions con personId, paymentId y redeemedAt", async () => {
      const codeId = ids.codeIds[0]; // CUMPLE-E2E
      const r1 = await prisma.discountRedemption.create({
        data: { codeId, personId: ids.redeemerId, paymentId: "pay-e2e" },
      });
      ids.redemptionIds.push(r1.id);
      const r2 = await prisma.discountRedemption.create({
        data: { codeId, personId: ids.dancerId },
      });
      ids.redemptionIds.push(r2.id);

      const res = await get(
        `/api/discount-codes/${codeId}/redemptions`,
        adminSession,
      );
      expect(res.status).toBe(200);
      const list = await res.json();
      expect(list).toHaveLength(2);
      const conPago = list.find(
        (r: { personId: string }) => r.personId === ids.redeemerId,
      );
      expect(conPago.paymentId).toBe("pay-e2e");
      expect(conPago.redeemedAt).toBeTruthy();
      const sinPago = list.find(
        (r: { personId: string }) => r.personId === ids.dancerId,
      );
      expect(sinPago.paymentId).toBeNull();
    });

    it("sin sesión → 401", async () => {
      const res = await get(
        `/api/discount-codes/${ids.codeIds[0]}/redemptions`,
      );
      expect(res.status).toBe(401);
    });

    it("sin rol PRODUCER/ADMIN → 403", async () => {
      const res = await get(
        `/api/discount-codes/${ids.codeIds[0]}/redemptions`,
        dancerSession,
      );
      expect(res.status).toBe(403);
    });
  });
});
