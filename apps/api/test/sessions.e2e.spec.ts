import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Test } from "@nestjs/testing";
import { ValidationPipe, type INestApplication } from "@nestjs/common";
import { SessionsModule } from "../src/sessions/sessions.module";
import { AuthModule } from "../src/auth/auth.module";
import { QrModule } from "../src/qr/qr.module";
import { AuthService } from "../src/auth/domain/auth.service";
import { QrService } from "../src/qr/domain/qr.service";
import { PrismaService } from "../src/prisma.service";

describe("sessions e2e", () => {
  let app: INestApplication;
  let baseUrl: string;
  let prisma: PrismaService;
  const auth = new AuthService(
    process.env.JWT_SECRET ?? "dev-secret-change-me",
  );
  const qr = new QrService(process.env.QR_SECRET ?? "dev-qr-secret-change-me");

  // A = inviter, B = invitee, C = outsider/tercera persona
  let aId: string;
  let bId: string;
  let cId: string;
  let aSession: string;
  let bSession: string;
  let cSession: string;

  const ids = { venueId: "", eventId: "", s1Id: "" };
  const createdSessionIds: string[] = [];

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

  const makeSession = (data: {
    inviterId: string;
    inviteeId: string;
    status?: "INVITED" | "CONFIRMED" | "DECLINED" | "DISCARDED" | "EXPIRED";
    scannedAt?: Date;
  }) =>
    prisma.danceSession
      .create({ data: { eventId: ids.eventId, ...data } })
      .then((s) => {
        createdSessionIds.push(s.id);
        return s;
      });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [SessionsModule, AuthModule, QrModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api");
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    await app.listen(0);
    prisma = new PrismaService();
    await prisma.$connect();
    const address = app.getHttpServer().address();
    baseUrl = `http://127.0.0.1:${address.port}`;

    // ─── datos de prueba ───
    const suffix = Date.now().toString(36);
    const venue = await prisma.venue.create({
      data: { name: `Venue Sessions Test ${suffix}` },
    });
    ids.venueId = venue.id;

    const event = await prisma.event.create({
      data: {
        venueId: venue.id,
        name: `Social Sessions Test ${suffix}`,
        status: "PUBLISHED",
        startsAt: new Date(Date.now() - 3600 * 1000),
        endsAt: new Date(Date.now() + 4 * 3600 * 1000),
      },
    });
    ids.eventId = event.id;

    const mkPerson = (name: string, tag: string) =>
      prisma.person.create({
        data: {
          name,
          email: `sessions-${tag}-${suffix}@test.cl`,
          roles: { create: [{ role: "DANCER", status: "APPROVED" }] },
        },
      });

    const a = await mkPerson("Inviter E2E", "a");
    const b = await mkPerson("Invitee E2E", "b");
    const c = await mkPerson("Outsider E2E", "c");
    aId = a.id;
    bId = b.id;
    cId = c.id;
    aSession = await auth.issueSession(aId);
    bSession = await auth.issueSession(bId);
    cSession = await auth.issueSession(cId);
  });

  afterAll(async () => {
    await prisma.sessionRating.deleteMany({
      where: { sessionId: { in: createdSessionIds } },
    });
    await prisma.danceSession.deleteMany({
      where: { eventId: ids.eventId },
    });
    await prisma.event.delete({ where: { id: ids.eventId } });
    await prisma.venue.delete({ where: { id: ids.venueId } });
    await prisma.personRole.deleteMany({
      where: { personId: { in: [aId, bId, cId] } },
    });
    await prisma.person.deleteMany({ where: { id: { in: [aId, bId, cId] } } });
    await prisma.$disconnect();
    await app.close();
  });

  describe("POST /api/sessions/invite", () => {
    it("sin sesión → 401", async () => {
      const res = await post("/api/sessions/invite", {
        qrToken: "x",
        eventId: ids.eventId,
      });
      expect(res.status).toBe(401);
    });

    it("qrToken inválido → 400", async () => {
      const res = await post(
        "/api/sessions/invite",
        { qrToken: "token-basura", eventId: ids.eventId },
        aSession,
      );
      expect(res.status).toBe(400);
    });

    it("auto-invitación → 400", async () => {
      const { token } = await qr.mint(aId);
      const res = await post(
        "/api/sessions/invite",
        { qrToken: token, eventId: ids.eventId },
        aSession,
      );
      expect(res.status).toBe(400);
    });

    it("evento inexistente → 404", async () => {
      const { token } = await qr.mint(bId);
      const res = await post(
        "/api/sessions/invite",
        { qrToken: token, eventId: "evt-no-existe" },
        aSession,
      );
      expect(res.status).toBe(404);
    });

    it("scan válido → 201 INVITED con inviter {name, photoUrl}", async () => {
      const { token } = await qr.mint(bId);
      const res = await post(
        "/api/sessions/invite",
        { qrToken: token, eventId: ids.eventId },
        aSession,
      );
      expect(res.status).toBe(201);
      const body = await res.json();
      createdSessionIds.push(body.id);
      ids.s1Id = body.id;
      expect(body.status).toBe("INVITED");
      expect(body.inviterId).toBe(aId);
      expect(body.inviteeId).toBe(bId);
      expect(body.eventId).toBe(ids.eventId);
      expect(body.inviter.name).toBe("Inviter E2E");
      expect(body.inviter).toHaveProperty("photoUrl");
    });

    it("re-invite dentro del cooldown ~4min → 409 (ambas direcciones)", async () => {
      const tokenAB = await qr.mint(bId);
      const res1 = await post(
        "/api/sessions/invite",
        { qrToken: tokenAB.token, eventId: ids.eventId },
        aSession,
      );
      expect(res1.status).toBe(409);

      const tokenBA = await qr.mint(aId);
      const res2 = await post(
        "/api/sessions/invite",
        { qrToken: tokenBA.token, eventId: ids.eventId },
        bSession,
      );
      expect(res2.status).toBe(409);
    });

    it("pasado el cooldown (scannedAt >4min) → 201 de nuevo", async () => {
      await prisma.danceSession.update({
        where: { id: ids.s1Id },
        data: { scannedAt: new Date(Date.now() - 5 * 60 * 1000) },
      });
      const { token } = await qr.mint(bId);
      const res = await post(
        "/api/sessions/invite",
        { qrToken: token, eventId: ids.eventId },
        aSession,
      );
      expect(res.status).toBe(201);
      const body = await res.json();
      createdSessionIds.push(body.id);
      expect(body.status).toBe("INVITED");
    });
  });

  describe("POST /api/sessions/:id/confirm", () => {
    it("inviter no puede confirmar → 403", async () => {
      const res = await post(
        `/api/sessions/${ids.s1Id}/confirm`,
        {},
        aSession,
      );
      expect(res.status).toBe(403);
    });

    it("tercero no puede confirmar → 403", async () => {
      const res = await post(
        `/api/sessions/${ids.s1Id}/confirm`,
        {},
        cSession,
      );
      expect(res.status).toBe(403);
    });

    it("invitee confirma → 200 CONFIRMED con confirmedAt", async () => {
      const res = await post(
        `/api/sessions/${ids.s1Id}/confirm`,
        {},
        bSession,
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("CONFIRMED");
      expect(body.confirmedAt).toBeTruthy();
    });

    it("confirmar dos veces → 409", async () => {
      const res = await post(
        `/api/sessions/${ids.s1Id}/confirm`,
        {},
        bSession,
      );
      expect(res.status).toBe(409);
    });

    it("invitación expirada (>24h sin confirmar) → 409", async () => {
      const old = await makeSession({
        inviterId: cId,
        inviteeId: aId,
        scannedAt: new Date(Date.now() - 25 * 3600 * 1000),
      });
      const res = await post(`/api/sessions/${old.id}/confirm`, {}, aSession);
      expect(res.status).toBe(409);
    });

    it("sesión inexistente → 404", async () => {
      const res = await post("/api/sessions/no-existe/confirm", {}, aSession);
      expect(res.status).toBe(404);
    });
  });

  describe("POST /api/sessions/:id/decline", () => {
    it("inviter no puede declinar → 403", async () => {
      const s = await makeSession({ inviterId: bId, inviteeId: cId });
      const res = await post(`/api/sessions/${s.id}/decline`, {}, bSession);
      expect(res.status).toBe(403);
    });

    it("invitee declina → 200 DECLINED", async () => {
      const s = await makeSession({ inviterId: aId, inviteeId: cId });
      const res = await post(`/api/sessions/${s.id}/decline`, {}, cSession);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("DECLINED");
    });

    it("sesión DECLINED no bloquea nueva invitación del par", async () => {
      const { token } = await qr.mint(cId);
      const res = await post(
        "/api/sessions/invite",
        { qrToken: token, eventId: ids.eventId },
        aSession,
      );
      expect(res.status).toBe(201);
      const body = await res.json();
      createdSessionIds.push(body.id);
    });
  });

  describe("POST /api/sessions/:id/discard", () => {
    it("invitee no puede descartar → 403", async () => {
      const s = await makeSession({ inviterId: bId, inviteeId: aId });
      const res = await post(`/api/sessions/${s.id}/discard`, {}, aSession);
      expect(res.status).toBe(403);
    });

    it("inviter descarta → 200 DISCARDED", async () => {
      const s = await makeSession({ inviterId: bId, inviteeId: aId });
      const res = await post(`/api/sessions/${s.id}/discard`, {}, bSession);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("DISCARDED");
    });

    it("descartar sesión ya CONFIRMED → 409", async () => {
      const res = await post(
        `/api/sessions/${ids.s1Id}/discard`,
        {},
        aSession,
      );
      expect(res.status).toBe(409);
    });
  });

  describe("POST /api/sessions/:id/rate", () => {
    it("no participante → 403", async () => {
      const res = await post(
        `/api/sessions/${ids.s1Id}/rate`,
        { score: 5 },
        cSession,
      );
      expect(res.status).toBe(403);
    });

    it("sesión no CONFIRMED → 409", async () => {
      const s = await makeSession({ inviterId: aId, inviteeId: bId });
      const res = await post(
        `/api/sessions/${s.id}/rate`,
        { score: 5 },
        aSession,
      );
      expect(res.status).toBe(409);
    });

    it.each([0, 6, -1])("score %i fuera de rango → 400", async (score) => {
      const res = await post(
        `/api/sessions/${ids.s1Id}/rate`,
        { score },
        aSession,
      );
      expect(res.status).toBe(400);
    });

    it("participante puntúa → 200 con rating; segundo rating actualiza (upsert)", async () => {
      const res = await post(
        `/api/sessions/${ids.s1Id}/rate`,
        { score: 5 },
        aSession,
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.sessionId).toBe(ids.s1Id);
      expect(body.raterId).toBe(aId);
      expect(body.global).toBe(5);

      const res2 = await post(
        `/api/sessions/${ids.s1Id}/rate`,
        { score: 4, connection: 3 },
        aSession,
      );
      expect(res2.status).toBe(200);
      const body2 = await res2.json();
      expect(body2.global).toBe(4);
      expect(body2.connection).toBe(3);

      const count = await prisma.sessionRating.count({
        where: { sessionId: ids.s1Id, raterId: aId },
      });
      expect(count).toBe(1);
    });

    it("el otro participante también puede puntuar", async () => {
      const res = await post(
        `/api/sessions/${ids.s1Id}/rate`,
        { score: 3 },
        bSession,
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.raterId).toBe(bId);
      expect(body.global).toBe(3);
    });
  });

  describe("GET /api/sessions/mine", () => {
    it("sin sesión → 401", async () => {
      const res = await get(`/api/sessions/mine?eventId=${ids.eventId}`);
      expect(res.status).toBe(401);
    });

    it("lista mis sesiones del evento con datos de la contraparte", async () => {
      const res = await get(
        `/api/sessions/mine?eventId=${ids.eventId}`,
        aSession,
      );
      expect(res.status).toBe(200);
      const list = await res.json();
      expect(Array.isArray(list)).toBe(true);
      expect(list.length).toBeGreaterThanOrEqual(4);

      const s1 = list.find((s: { id: string }) => s.id === ids.s1Id);
      expect(s1.status).toBe("CONFIRMED");
      expect(s1.role).toBe("inviter");
      expect(s1.partner.name).toBe("Invitee E2E");
      expect(s1.myRating.global).toBe(4);

      // sesiones donde fui invitee también aparecen
      const asInvitee = list.find(
        (s: { role: string }) => s.role === "invitee",
      );
      expect(asInvitee).toBeTruthy();
      expect(asInvitee.partner).toHaveProperty("name");
    });

    it("invitación >24h se expone como EXPIRED (lazy)", async () => {
      const res = await get(
        `/api/sessions/mine?eventId=${ids.eventId}`,
        aSession,
      );
      const list = await res.json();
      const expired = list.find(
        (s: { status: string }) => s.status === "EXPIRED",
      );
      expect(expired).toBeTruthy();
    });

    it("no devuelve sesiones ajenas", async () => {
      const res = await get(
        `/api/sessions/mine?eventId=${ids.eventId}`,
        cSession,
      );
      const list = await res.json();
      for (const s of list) {
        // C solo ve sesiones donde participa
        expect(s.role === "inviter" ? s.inviterId : s.inviteeId).toBe(cId);
      }
      expect(list.every((s: { id: string }) => s.id !== ids.s1Id)).toBe(true);
    });
  });
});
