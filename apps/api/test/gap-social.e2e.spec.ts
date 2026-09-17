import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Test } from "@nestjs/testing";
import { ValidationPipe, type INestApplication } from "@nestjs/common";
import { SessionsModule } from "../src/sessions/sessions.module";
import { AuthModule } from "../src/auth/auth.module";
import { NotificationsModule } from "../src/notifications/notifications.module";
import { AuthService } from "../src/auth/domain/auth.service";
import { QrService } from "../src/qr/domain/qr.service";
import { PrismaService } from "../src/prisma.service";
// Controllers nuevos aún no registrados en SocialModule (wiring del padre
// pendiente): se montan directo en el test module para cubrir el contrato.
import { BlocksController } from "../src/social/infrastructure/blocks.controller";
import { FriendsController } from "../src/social/infrastructure/friends.controller";

describe("spec-gap-closure: blocks + declare + friendships e2e", () => {
  let app: INestApplication;
  let baseUrl: string;
  let prisma: PrismaService;
  const auth = new AuthService(
    process.env.JWT_SECRET ?? "dev-secret-change-me",
  );
  const qr = new QrService(process.env.QR_SECRET ?? "dev-qr-secret-change-me");

  let sessionA: string;
  let sessionB: string;
  let sessionC: string;
  let sessionD: string;

  const ids = {
    aId: "",
    bId: "",
    cId: "",
    dId: "",
    venueId: "",
    eventId: "",
  };

  const req = (
    method: string,
    path: string,
    body?: unknown,
    session?: string,
  ) =>
    fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
        ...(session ? { cookie: `omnidance_session=${session}` } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [SessionsModule, AuthModule, NotificationsModule],
      controllers: [BlocksController, FriendsController],
      providers: [PrismaService],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api");
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    await app.listen(0);
    prisma = app.get(PrismaService);
    const address = app.getHttpServer().address();
    baseUrl = `http://127.0.0.1:${address.port}`;

    // ─── fixtures ───
    const suffix = Date.now().toString(36);
    const venue = await prisma.venue.create({
      data: { name: `Venue Gap Social ${suffix}` },
    });
    ids.venueId = venue.id;

    const event = await prisma.event.create({
      data: {
        venueId: venue.id,
        name: `Social Gap Social ${suffix}`,
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
          email: `gap-social-${tag}-${suffix}@test.cl`,
          roles: { create: [{ role: "DANCER", status: "APPROVED" }] },
        },
      });

    const [a, b, c, d] = await Promise.all([
      mkPerson("Gap A", "a"),
      mkPerson("Gap B", "b"),
      mkPerson("Gap C", "c"),
      mkPerson("Gap D", "d"),
    ]);
    ids.aId = a.id;
    ids.bId = b.id;
    ids.cId = c.id;
    ids.dId = d.id;
    sessionA = await auth.issueSession(a.id);
    sessionB = await auth.issueSession(b.id);
    sessionC = await auth.issueSession(c.id);
    sessionD = await auth.issueSession(d.id);
  });

  afterAll(async () => {
    const people = [ids.aId, ids.bId, ids.cId, ids.dId];
    await prisma.sessionRating.deleteMany({
      where: { session: { eventId: ids.eventId } },
    });
    await prisma.danceSession.deleteMany({
      where: { eventId: ids.eventId },
    });
    await prisma.userBlock.deleteMany({
      where: { blockerId: { in: people } },
    });
    await prisma.friendship.deleteMany({
      where: { OR: [{ aId: { in: people } }, { bId: { in: people } }] },
    });
    await prisma.notification.deleteMany({
      where: { personId: { in: people } },
    });
    await prisma.event.delete({ where: { id: ids.eventId } });
    await prisma.venue.delete({ where: { id: ids.venueId } });
    await prisma.personRole.deleteMany({
      where: { personId: { in: people } },
    });
    await prisma.person.deleteMany({ where: { id: { in: people } } });
    await app.close();
  });

  // ═══════════════════════ BLOCKS ═══════════════════════
  describe("POST /api/blocks", () => {
    it("sin sesión → 401", async () => {
      const res = await req("POST", "/api/blocks", { personId: ids.bId });
      expect(res.status).toBe(401);
    });

    it("auto-bloqueo → 400", async () => {
      const res = await req(
        "POST",
        "/api/blocks",
        { personId: ids.bId },
        sessionB,
      );
      expect(res.status).toBe(400);
    });

    it("persona inexistente → 404", async () => {
      const res = await req(
        "POST",
        "/api/blocks",
        { personId: "persona-fantasma" },
        sessionB,
      );
      expect(res.status).toBe(404);
    });

    it("B bloquea a A → 201; repetir → 200 idempotente sin duplicar", async () => {
      const res1 = await req(
        "POST",
        "/api/blocks",
        { personId: ids.aId },
        sessionB,
      );
      expect(res1.status).toBe(201);

      const res2 = await req(
        "POST",
        "/api/blocks",
        { personId: ids.aId },
        sessionB,
      );
      expect(res2.status).toBe(200);

      const count = await prisma.userBlock.count({
        where: { blockerId: ids.bId, blockedId: ids.aId },
      });
      expect(count).toBe(1);
    });
  });

  describe("enforcement silencioso en invite/declare", () => {
    it("A invita a B (B bloqueó a A) → 403 genérico, sin sesión ni notificación", async () => {
      const { token } = await qr.mint(ids.bId);
      const res = await req(
        "POST",
        "/api/sessions/invite",
        { qrToken: token, eventId: ids.eventId },
        sessionA,
      );
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.message).toBe("no se puede enviar la invitación");
      expect(body.message).not.toMatch(/bloque/i);

      const sessions = await prisma.danceSession.count({
        where: { inviterId: ids.aId, inviteeId: ids.bId },
      });
      expect(sessions).toBe(0);
      const notifs = await prisma.notification.count({
        where: { personId: ids.bId, type: "session.invite" },
      });
      expect(notifs).toBe(0);
    });

    it("A declara a B (B bloqueó a A) → 403 igual que el QR", async () => {
      const res = await req(
        "POST",
        "/api/sessions/declare",
        { eventId: ids.eventId, personId: ids.bId },
        sessionA,
      );
      expect(res.status).toBe(403);
      expect((await res.json()).message).toBe(
        "no se puede enviar la invitación",
      );
    });

    it("dirección correcta: D bloquea a C, pero D SÍ puede invitar a C", async () => {
      const res1 = await req(
        "POST",
        "/api/blocks",
        { personId: ids.cId },
        sessionD,
      );
      expect(res1.status).toBe(201);

      const { token } = await qr.mint(ids.cId);
      const res2 = await req(
        "POST",
        "/api/sessions/invite",
        { qrToken: token, eventId: ids.eventId },
        sessionD,
      );
      expect(res2.status).toBe(201);
      expect((await res2.json()).status).toBe("INVITED");
    });
  });

  describe("GET /api/blocks", () => {
    it("lista solo mis bloqueos con person {id,name,photoUrl}", async () => {
      const res = await req("GET", "/api/blocks", undefined, sessionB);
      expect(res.status).toBe(200);
      const list = await res.json();
      const blockA = list.find(
        (b: { blockedId: string }) => b.blockedId === ids.aId,
      );
      expect(blockA).toBeDefined();
      expect(blockA.person).toMatchObject({ id: ids.aId, name: "Gap A" });
      expect(blockA.person).toHaveProperty("photoUrl");

      // A no ve el bloqueo de B (silencioso)
      const resA = await req("GET", "/api/blocks", undefined, sessionA);
      const listA = await resA.json();
      expect(
        listA.some((b: { blockedId: string }) => b.blockedId === ids.bId),
      ).toBe(false);
    });
  });

  describe("DELETE /api/blocks/:personId", () => {
    it("bloqueo inexistente → 404", async () => {
      const res = await req(
        "DELETE",
        `/api/blocks/${ids.cId}`,
        undefined,
        sessionB,
      );
      expect(res.status).toBe(404);
    });

    it("B desbloquea a A → A puede invitarla de nuevo", async () => {
      const res = await req(
        "DELETE",
        `/api/blocks/${ids.aId}`,
        undefined,
        sessionB,
      );
      expect(res.status).toBe(200);

      const { token } = await qr.mint(ids.bId);
      const res2 = await req(
        "POST",
        "/api/sessions/invite",
        { qrToken: token, eventId: ids.eventId },
        sessionA,
      );
      expect(res2.status).toBe(201);
      const session = await res2.json();
      expect(session.status).toBe("INVITED");
      expect(session.retroDeclared).toBe(false);
    });
  });

  // ═══════════════════════ DECLARE ═══════════════════════
  describe("POST /api/sessions/declare", () => {
    it("sin sesión → 401", async () => {
      const res = await req("POST", "/api/sessions/declare", {
        eventId: ids.eventId,
        personId: ids.cId,
      });
      expect(res.status).toBe(401);
    });

    it("persona inexistente → 404", async () => {
      const res = await req(
        "POST",
        "/api/sessions/declare",
        { eventId: ids.eventId, personId: "persona-fantasma" },
        sessionA,
      );
      expect(res.status).toBe(404);
    });

    it("evento inexistente → 404", async () => {
      const res = await req(
        "POST",
        "/api/sessions/declare",
        { eventId: "evt-fantasma", personId: ids.cId },
        sessionA,
      );
      expect(res.status).toBe(404);
    });

    it("auto-declaración → 400", async () => {
      const res = await req(
        "POST",
        "/api/sessions/declare",
        { eventId: ids.eventId, personId: ids.aId },
        sessionA,
      );
      expect(res.status).toBe(400);
    });

    it("declaración exitosa → 201 INVITED retroDeclared:true + notifica", async () => {
      const res = await req(
        "POST",
        "/api/sessions/declare",
        { eventId: ids.eventId, personId: ids.cId },
        sessionA,
      );
      expect(res.status).toBe(201);
      const session = await res.json();
      expect(session.status).toBe("INVITED");
      expect(session.retroDeclared).toBe(true);
      expect(session.inviterId).toBe(ids.aId);
      expect(session.inviteeId).toBe(ids.cId);
      expect(session.inviter.name).toBe("Gap A");

      const notif = await prisma.notification.findFirst({
        where: { personId: ids.cId, type: "session.invite" },
      });
      expect(notif).toBeTruthy();
    });

    it("re-declarar el mismo par dentro del cooldown → 409", async () => {
      const res = await req(
        "POST",
        "/api/sessions/declare",
        { eventId: ids.eventId, personId: ids.cId },
        sessionA,
      );
      expect(res.status).toBe(409);
    });

    it("la contraparte confirma → CONFIRMED y rateable igual que escaneada", async () => {
      const declared = await prisma.danceSession.findFirst({
        where: {
          inviterId: ids.aId,
          inviteeId: ids.cId,
          retroDeclared: true,
        },
      });
      expect(declared).toBeTruthy();

      const res = await req(
        "POST",
        `/api/sessions/${declared!.id}/confirm`,
        {},
        sessionC,
      );
      expect(res.status).toBe(200);
      expect((await res.json()).status).toBe("CONFIRMED");

      const rate = await req(
        "POST",
        `/api/sessions/${declared!.id}/rate`,
        { score: 4 },
        sessionA,
      );
      expect(rate.status).toBe(200);
      expect((await rate.json()).global).toBe(4);
    });
  });

  // ═══════════════════════ FRIENDS ═══════════════════════
  describe("POST /api/friends", () => {
    it("sin sesión → 401", async () => {
      const res = await req("POST", "/api/friends", { personId: ids.bId });
      expect(res.status).toBe(401);
    });

    it("auto-solicitud → 400", async () => {
      const res = await req(
        "POST",
        "/api/friends",
        { personId: ids.aId },
        sessionA,
      );
      expect(res.status).toBe(400);
    });

    it("persona inexistente → 404", async () => {
      const res = await req(
        "POST",
        "/api/friends",
        { personId: "persona-fantasma" },
        sessionA,
      );
      expect(res.status).toBe(404);
    });

    it("A→B → 201 PENDING (aId=requester, bId=recipient) + notify friend.request", async () => {
      const res = await req(
        "POST",
        "/api/friends",
        { personId: ids.bId },
        sessionA,
      );
      expect(res.status).toBe(201);
      const f = await res.json();
      expect(f.status).toBe("PENDING");
      expect(f.aId).toBe(ids.aId);
      expect(f.bId).toBe(ids.bId);

      const notif = await prisma.notification.findFirst({
        where: { personId: ids.bId, type: "friend.request" },
      });
      expect(notif).toBeTruthy();
      expect(notif!.category).toBe("SOCIAL");
    });

    it("duplicada en cualquier dirección → 409", async () => {
      const res1 = await req(
        "POST",
        "/api/friends",
        { personId: ids.bId },
        sessionA,
      );
      expect(res1.status).toBe(409);

      const res2 = await req(
        "POST",
        "/api/friends",
        { personId: ids.aId },
        sessionB,
      );
      expect(res2.status).toBe(409);
    });
  });

  describe("POST /api/friends/:id/accept", () => {
    let friendshipId: string;

    beforeAll(async () => {
      const f = await prisma.friendship.findFirst({
        where: { aId: ids.aId, bId: ids.bId },
      });
      friendshipId = f!.id;
    });

    it("inexistente → 404", async () => {
      const res = await req(
        "POST",
        "/api/friends/fr-fantasma/accept",
        {},
        sessionB,
      );
      expect(res.status).toBe(404);
    });

    it("el solicitante no puede aceptar → 403", async () => {
      const res = await req(
        "POST",
        `/api/friends/${friendshipId}/accept`,
        {},
        sessionA,
      );
      expect(res.status).toBe(403);
    });

    it("tercero no puede aceptar → 403", async () => {
      const res = await req(
        "POST",
        `/api/friends/${friendshipId}/accept`,
        {},
        sessionC,
      );
      expect(res.status).toBe(403);
    });

    it("el destinatario acepta → 200 ACCEPTED y ambos la ven en GET /friends", async () => {
      const res = await req(
        "POST",
        `/api/friends/${friendshipId}/accept`,
        {},
        sessionB,
      );
      expect(res.status).toBe(200);
      expect((await res.json()).status).toBe("ACCEPTED");

      const listA = await (
        await req("GET", "/api/friends", undefined, sessionA)
      ).json();
      const friendA = listA.friends.find(
        (f: { person: { id: string } }) => f.person.id === ids.bId,
      );
      expect(friendA).toBeDefined();
      expect(friendA.person.name).toBe("Gap B");
      expect(friendA.person).toHaveProperty("photoUrl");
      expect(listA.pendingReceived).toHaveLength(0);
      expect(listA.pendingSent).toHaveLength(0);

      const listB = await (
        await req("GET", "/api/friends", undefined, sessionB)
      ).json();
      expect(
        listB.friends.some(
          (f: { person: { id: string } }) => f.person.id === ids.aId,
        ),
      ).toBe(true);
    });
  });

  describe("pending lists + decline/delete", () => {
    it("C→A pendiente: aparece en pendingReceived de A y pendingSent de C", async () => {
      const res = await req(
        "POST",
        "/api/friends",
        { personId: ids.aId },
        sessionC,
      );
      expect(res.status).toBe(201);

      const listA = await (
        await req("GET", "/api/friends", undefined, sessionA)
      ).json();
      const rec = listA.pendingReceived.find(
        (f: { person: { id: string } }) => f.person.id === ids.cId,
      );
      expect(rec).toBeDefined();
      expect(rec.status).toBe("PENDING");

      const listC = await (
        await req("GET", "/api/friends", undefined, sessionC)
      ).json();
      expect(
        listC.pendingSent.some(
          (f: { person: { id: string } }) => f.person.id === ids.aId,
        ),
      ).toBe(true);
    });

    it("decline del destinatario elimina la solicitud", async () => {
      const pending = await prisma.friendship.findFirst({
        where: { aId: ids.cId, bId: ids.aId, status: "PENDING" },
      });
      expect(pending).toBeTruthy();

      const res = await req(
        "POST",
        `/api/friends/${pending!.id}/decline`,
        {},
        sessionA,
      );
      expect(res.status).toBe(200);

      const gone = await prisma.friendship.findUnique({
        where: { id: pending!.id },
      });
      expect(gone).toBeNull();
    });

    it("tercero no puede borrar una amistad ajena → 403", async () => {
      const ab = await prisma.friendship.findFirst({
        where: { aId: ids.aId, bId: ids.bId },
      });
      const res = await req(
        "DELETE",
        `/api/friends/${ab!.id}`,
        undefined,
        sessionC,
      );
      expect(res.status).toBe(403);
    });

    it("DELETE por participante elimina la amistad aceptada", async () => {
      const ab = await prisma.friendship.findFirst({
        where: { aId: ids.aId, bId: ids.bId },
      });
      const res = await req(
        "DELETE",
        `/api/friends/${ab!.id}`,
        undefined,
        sessionA,
      );
      expect(res.status).toBe(200);

      const listB = await (
        await req("GET", "/api/friends", undefined, sessionB)
      ).json();
      expect(listB.friends).toHaveLength(0);
    });

    it("DELETE inexistente → 404", async () => {
      const res = await req(
        "DELETE",
        "/api/friends/fr-fantasma",
        undefined,
        sessionA,
      );
      expect(res.status).toBe(404);
    });
  });
});
