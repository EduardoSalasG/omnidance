import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Test } from "@nestjs/testing";
import { ValidationPipe, type INestApplication } from "@nestjs/common";
import { AuthModule } from "../src/auth/auth.module";
import { AuthService } from "../src/auth/domain/auth.service";
import { NotificationsModule } from "../src/notifications/notifications.module";
import { NotificationsService } from "../src/notifications/domain/notifications.service";
import { PrismaService } from "../src/prisma.service";

describe("notifications e2e", () => {
  let app: INestApplication;
  let baseUrl: string;
  let prisma: PrismaService;
  let notifications: NotificationsService;
  const auth = new AuthService(
    process.env.JWT_SECRET ?? "dev-secret-change-me",
  );

  let mySession: string;
  let otherSession: string;
  let myId: string;
  let otherId: string;

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

  const del = (path: string, session?: string) =>
    fetch(`${baseUrl}${path}`, {
      method: "DELETE",
      headers: session ? { cookie: `omnidance_session=${session}` } : {},
    });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [NotificationsModule, AuthModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api");
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    await app.listen(0);
    prisma = app.get(PrismaService);
    notifications = app.get(NotificationsService);
    const address = app.getHttpServer().address();
    baseUrl = `http://127.0.0.1:${address.port}`;

    // ─── datos de prueba ───
    const me = await prisma.person.create({
      data: { name: "Notif User Uno" },
    });
    myId = me.id;
    mySession = await auth.issueSession(me.id);

    const other = await prisma.person.create({
      data: { name: "Notif User Dos" },
    });
    otherId = other.id;
    otherSession = await auth.issueSession(other.id);
  });

  afterAll(async () => {
    await prisma.notification.deleteMany({
      where: { personId: { in: [myId, otherId] } },
    });
    await prisma.pushToken.deleteMany({
      where: { personId: { in: [myId, otherId] } },
    });
    await prisma.person.deleteMany({ where: { id: { in: [myId, otherId] } } });
    await app.close();
  });

  describe("GET /api/notifications", () => {
    it("sin sesión → 401", async () => {
      const res = await get("/api/notifications");
      expect(res.status).toBe(401);
    });

    it("lista vacía → { notifications: [], unreadCount: 0 }", async () => {
      const res = await get("/api/notifications", mySession);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.notifications).toEqual([]);
      expect(body.unreadCount).toBe(0);
    });

    it("lista las propias ordenadas desc con unreadCount", async () => {
      await notifications.notify(myId, {
        category: "SOCIAL",
        type: "session_invite",
        title: "Te invitaron a bailar",
      });
      await notifications.notify(myId, {
        category: "TRANSACTIONAL",
        type: "ticket_paid",
        title: "Ticket pagado",
        data: { paymentId: "pay-1" },
      });
      await notifications.notify(otherId, {
        category: "SOCIAL",
        type: "session_invite",
        title: "Ajena",
      });

      const res = await get("/api/notifications", mySession);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.notifications).toHaveLength(2);
      expect(body.notifications[0].title).toBe("Ticket pagado");
      expect(body.notifications[0].data).toEqual({ paymentId: "pay-1" });
      expect(body.notifications[1].title).toBe("Te invitaron a bailar");
      expect(body.unreadCount).toBe(2);
    });

    it("unread=true solo devuelve no leídas", async () => {
      const list = await (
        await get("/api/notifications", mySession)
      ).json();
      const id = list.notifications[0].id;
      await post(`/api/notifications/${id}/read`, {}, mySession);

      const res = await get("/api/notifications?unread=true", mySession);
      const body = await res.json();
      expect(body.notifications).toHaveLength(1);
      expect(body.notifications[0].id).not.toBe(id);
      expect(body.unreadCount).toBe(1);
    });

    it("limit=1 devuelve solo una", async () => {
      const res = await get("/api/notifications?limit=1", mySession);
      const body = await res.json();
      expect(body.notifications).toHaveLength(1);
    });

    it("limit inválido → 400", async () => {
      const res = await get("/api/notifications?limit=abc", mySession);
      expect(res.status).toBe(400);
    });
  });

  describe("POST /api/notifications/:id/read", () => {
    it("sin sesión → 401", async () => {
      const res = await post("/api/notifications/x/read", {});
      expect(res.status).toBe(401);
    });

    it("inexistente → 404", async () => {
      const res = await post("/api/notifications/no-existe/read", {}, mySession);
      expect(res.status).toBe(404);
    });

    it("de otra persona → 403", async () => {
      const ajena = await notifications.notify(otherId, {
        category: "SOCIAL",
        type: "x",
        title: "ajena",
      });
      const res = await post(
        `/api/notifications/${ajena.id}/read`,
        {},
        mySession,
      );
      expect(res.status).toBe(403);
    });

    it("propia → 200 con readAt", async () => {
      const n = await notifications.notify(myId, {
        category: "OPERATIONAL",
        type: "prime_unlocked",
        title: "Prime",
      });
      const res = await post(`/api/notifications/${n.id}/read`, {}, mySession);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.id).toBe(n.id);
      expect(body.readAt).toBeTruthy();
    });
  });

  describe("POST /api/notifications/read-all", () => {
    it("sin sesión → 401", async () => {
      const res = await post("/api/notifications/read-all", {});
      expect(res.status).toBe(401);
    });

    it("marca todas las del usuario y unreadCount queda en 0", async () => {
      const res = await post("/api/notifications/read-all", {}, mySession);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.updated).toBeGreaterThanOrEqual(1);

      const list = await (
        await get("/api/notifications", mySession)
      ).json();
      expect(list.unreadCount).toBe(0);
    });
  });

  describe("POST /api/push-tokens", () => {
    it("sin sesión → 401", async () => {
      const res = await post("/api/push-tokens", {
        token: "tok-1",
        platform: "WEB",
      });
      expect(res.status).toBe(401);
    });

    it("registra token → 201", async () => {
      const res = await post(
        "/api/push-tokens",
        { token: "e2e-tok-web", platform: "WEB" },
        mySession,
      );
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.token).toBe("e2e-tok-web");
      expect(body.personId).toBe(myId);
    });

    it("mismo token → upsert idempotente", async () => {
      const res = await post(
        "/api/push-tokens",
        { token: "e2e-tok-web", platform: "ANDROID" },
        mySession,
      );
      expect(res.status).toBe(201);
      const count = await prisma.pushToken.count({
        where: { token: "e2e-tok-web" },
      });
      expect(count).toBe(1);
      const row = await prisma.pushToken.findUniqueOrThrow({
        where: { token: "e2e-tok-web" },
      });
      expect(row.payload).toEqual({ platform: "ANDROID" });
    });

    it("plataforma inválida → 400", async () => {
      const res = await post(
        "/api/push-tokens",
        { token: "tok-x", platform: "SMART_TV" },
        mySession,
      );
      expect(res.status).toBe(400);
    });
  });

  describe("DELETE /api/push-tokens/:token", () => {
    it("sin sesión → 401", async () => {
      const res = await del("/api/push-tokens/e2e-tok-web");
      expect(res.status).toBe(401);
    });

    it("de otra persona → 403", async () => {
      const res = await del("/api/push-tokens/e2e-tok-web", otherSession);
      expect(res.status).toBe(403);
    });

    it("propio → 200 y queda eliminado", async () => {
      const res = await del("/api/push-tokens/e2e-tok-web", mySession);
      expect(res.status).toBe(200);
      const row = await prisma.pushToken.findUnique({
        where: { token: "e2e-tok-web" },
      });
      expect(row).toBeNull();
    });

    it("inexistente → 404", async () => {
      const res = await del("/api/push-tokens/no-existe", mySession);
      expect(res.status).toBe(404);
    });
  });
});
