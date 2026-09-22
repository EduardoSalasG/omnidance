import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Test } from "@nestjs/testing";
import { ValidationPipe, type INestApplication } from "@nestjs/common";
import { AuthModule } from "../src/auth/auth.module";
import { AuthService } from "../src/auth/domain/auth.service";
import { QrModule } from "../src/qr/qr.module";
import { QrService } from "../src/qr/domain/qr.service";
import { ParamsModule } from "../src/params/params.module";
import { NotificationsModule } from "../src/notifications/notifications.module";
import { GamificationModule } from "../src/gamification/gamification.module";
import { SessionsService } from "../src/sessions/domain/sessions.service";
import { SessionsController } from "../src/sessions/infrastructure/sessions.controller";
import { PaymentsController } from "../src/payments/infrastructure/webhook.controller";
import { WaitlistController } from "../src/social/infrastructure/waitlist.controller";
import { PAYMENT_GATEWAY } from "../src/payments/domain/ports";
import { PricingService } from "../src/payments/domain/pricing.service";
import { StubGateway } from "../src/payments/infrastructure/stub.gateway";
import { encodeTicketOrderRef } from "../src/payments/domain/order-ref";
import { PrismaService } from "../src/prisma.service";

/**
 * Wiring e2e: notificaciones + gamificación enganchadas en flujos de dominio.
 *
 * Los módulos reales (SessionsModule, PaymentsModule, SocialModule) aún no
 * importan NotificationsModule/GamificationModule — por eso este spec declara
 * los controllers en el módulo de test directamente, reproduciendo el wiring
 * final esperado (ver handoff: imports pendientes por módulo).
 */
describe("wiring: notificaciones + gamificación en flujos de dominio", () => {
  let app: INestApplication;
  let baseUrl: string;
  let prisma: PrismaService;
  const auth = new AuthService(
    process.env.JWT_SECRET ?? "dev-secret-change-me",
  );
  const qr = new QrService(process.env.QR_SECRET ?? "dev-qr-secret-change-me");

  const suffix = Date.now().toString(36);
  const ids = {
    venueId: "",
    eventId: "",
    aId: "",
    bId: "",
    cId: "",
    buyerId: "",
    producerId: "",
    sessionAB: "",
  };
  let aSession: string;
  let bSession: string;
  let cSession: string;
  let buyerSession: string;
  let producerSession: string;

  const post = (path: string, body: unknown, session?: string) =>
    fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(session ? { cookie: `omnidance_session=${session}` } : {}),
      },
      body: JSON.stringify(body),
    });

  const notifsFor = (personId: string, type?: string) =>
    prisma.notification.findMany({
      where: { personId, ...(type ? { type } : {}) },
      orderBy: { createdAt: "desc" },
    });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        AuthModule,
        QrModule,
        ParamsModule,
        NotificationsModule,
        GamificationModule,
      ],
      controllers: [SessionsController, WaitlistController, PaymentsController],
      providers: [
        PrismaService,
        { provide: SessionsService, useFactory: () => new SessionsService() },
        { provide: PricingService, useFactory: () => new PricingService() },
        { provide: PAYMENT_GATEWAY, useClass: StubGateway },
      ],
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
      data: { name: `Venue Wiring ${suffix}` },
    });
    ids.venueId = venue.id;

    const event = await prisma.event.create({
      data: {
        venueId: venue.id,
        name: `Social Wiring ${suffix}`,
        status: "PUBLISHED",
        startsAt: new Date(Date.now() - 3600 * 1000),
        endsAt: new Date(Date.now() + 4 * 3600 * 1000),
      },
    });
    ids.eventId = event.id;

    const mkPerson = (name: string, tag: string, role = "DANCER") =>
      prisma.person.create({
        data: {
          name,
          email: `wiring-${tag}-${suffix}@test.cl`,
          roles: { create: [{ role, status: "APPROVED" }] },
        },
      });

    const a = await mkPerson("Wiring Inviter", "a");
    const b = await mkPerson("Wiring Invitee", "b");
    const c = await mkPerson("Wiring Third", "c");
    const buyer = await mkPerson("Wiring Buyer", "buyer");
    const producer = await mkPerson("Wiring Producer", "prod", "PRODUCER");
    ids.aId = a.id;
    ids.bId = b.id;
    ids.cId = c.id;
    ids.buyerId = buyer.id;
    ids.producerId = producer.id;
    aSession = await auth.issueSession(a.id);
    bSession = await auth.issueSession(b.id);
    cSession = await auth.issueSession(c.id);
    buyerSession = await auth.issueSession(buyer.id);
    producerSession = await auth.issueSession(producer.id);
  });

  afterAll(async () => {
    const peopleIds = [ids.aId, ids.bId, ids.cId, ids.buyerId, ids.producerId];
    await prisma.notification.deleteMany({
      where: { personId: { in: peopleIds } },
    });
    await prisma.personBadge.deleteMany({
      where: { personId: { in: peopleIds } },
    });
    await prisma.sessionRating.deleteMany({
      where: { session: { eventId: ids.eventId } },
    });
    await prisma.danceSession.deleteMany({ where: { eventId: ids.eventId } });
    await prisma.waitlist.deleteMany({ where: { eventId: ids.eventId } });
    await prisma.ticket.deleteMany({ where: { eventId: ids.eventId } });
    await prisma.payment.deleteMany({ where: { personId: { in: peopleIds } } });
    await prisma.event.delete({ where: { id: ids.eventId } });
    await prisma.venue.delete({ where: { id: ids.venueId } });
    await prisma.personRole.deleteMany({
      where: { personId: { in: peopleIds } },
    });
    await prisma.person.deleteMany({ where: { id: { in: peopleIds } } });
    await app.close();
  });

  // ═══════════════════════ SESSIONS ═══════════════════════
  describe("sesiones → notificaciones SOCIAL", () => {
    it("invite → notifica al invitee (session.invite, data.sessionId)", async () => {
      const { token } = await qr.mint(ids.bId);
      const res = await post(
        "/api/sessions/invite",
        { qrToken: token, eventId: ids.eventId },
        aSession,
      );
      expect(res.status).toBe(201);
      const body = await res.json();
      ids.sessionAB = body.id;

      const notifs = await notifsFor(ids.bId, "session.invite");
      expect(notifs).toHaveLength(1);
      expect(notifs[0].category).toBe("SOCIAL");
      expect(notifs[0].title).toContain("Wiring Inviter");
      expect(notifs[0].data).toEqual({ sessionId: ids.sessionAB });
      // el inviter no recibe notificación de su propia invitación
      expect(await notifsFor(ids.aId)).toHaveLength(0);
    });

    it("confirm → notifica al inviter (session.confirmed)", async () => {
      const res = await post(
        `/api/sessions/${ids.sessionAB}/confirm`,
        {},
        bSession,
      );
      expect(res.status).toBe(200);
      expect((await res.json()).status).toBe("CONFIRMED");

      const notifs = await notifsFor(ids.aId, "session.confirmed");
      expect(notifs).toHaveLength(1);
      expect(notifs[0].category).toBe("SOCIAL");
      expect(notifs[0].title).toContain("Wiring Invitee");
      expect(notifs[0].data).toEqual({ sessionId: ids.sessionAB });
    });

    it("decline → notifica al inviter (session.declined)", async () => {
      // par distinto (C → A) para no chocar con el cooldown del par A-B
      const { token } = await qr.mint(ids.aId);
      const invite = await post(
        "/api/sessions/invite",
        { qrToken: token, eventId: ids.eventId },
        cSession,
      );
      expect(invite.status).toBe(201);
      const s = await invite.json();

      const res = await post(`/api/sessions/${s.id}/decline`, {}, aSession);
      expect(res.status).toBe(200);

      const notifs = await notifsFor(ids.cId, "session.declined");
      expect(notifs).toHaveLength(1);
      expect(notifs[0].category).toBe("SOCIAL");
      expect(notifs[0].data).toEqual({ sessionId: s.id });
    });
  });

  describe("sesiones → hook de gamificación", () => {
    it("rate → status RATED y evalúa badges del rater Y del rated", async () => {
      // El catálogo Badge es global (seed + gamification.e2e también usan
      // 'primera_bachata'): upsert, no create. Los awards previos del confirm
      // se borran antes del rate — así el award solo puede venir del hook
      // del rate (evaluateBadgesFor para ambos participantes).
      const badge = await prisma.badge.upsert({
        where: { key: "primera_bachata" },
        update: {},
        create: {
          key: "primera_bachata",
          name: "Primera bachata",
          category: "MILESTONE",
        },
      });
      const personIds = [ids.aId, ids.bId];
      try {
        await prisma.personBadge.deleteMany({
          where: { personId: { in: personIds }, badgeId: badge.id },
        });
        expect(
          await prisma.personBadge.count({
            where: { personId: { in: personIds }, badgeId: badge.id },
          }),
        ).toBe(0);

        const res = await post(
          `/api/sessions/${ids.sessionAB}/rate`,
          { score: 5 },
          bSession,
        );
        expect(res.status).toBe(200);

        const session = await prisma.danceSession.findUniqueOrThrow({
          where: { id: ids.sessionAB },
        });
        expect(session.status).toBe("RATED");

        // ambos participantes ganan primera_bachata (1 sesión confirmada c/u)
        for (const personId of personIds) {
          const pb = await prisma.personBadge.findFirst({
            where: { personId, badgeId: badge.id },
          });
          expect(pb).toBeTruthy();
        }
      } finally {
        await prisma.personBadge.deleteMany({
          where: { personId: { in: personIds }, badgeId: badge.id },
        });
      }
    });

    it("la contraparte aún puede puntuar una sesión RATED", async () => {
      const res = await post(
        `/api/sessions/${ids.sessionAB}/rate`,
        { score: 4 },
        aSession,
      );
      expect(res.status).toBe(200);
      const session = await prisma.danceSession.findUniqueOrThrow({
        where: { id: ids.sessionAB },
      });
      expect(session.status).toBe("RATED");
    });
  });

  // ═══════════════════════ PAYMENTS ═══════════════════════
  describe("webhook payments → notificaciones TRANSACTIONAL", () => {
    it("PAID → notifica al buyer (payment.paid, data paymentId+refId)", async () => {
      const payment = await prisma.payment.create({
        data: {
          orderType: "TICKET",
          refId: encodeTicketOrderRef(ids.eventId),
          personId: ids.buyerId,
          amount: 10500,
          fee: 0,
          net: 10500,
        },
      });

      const res = await post("/api/payments/webhook", {
        refId: payment.refId,
        status: "PAID",
      });
      expect(res.status).toBe(200);

      const notifs = await notifsFor(ids.buyerId, "payment.paid");
      expect(notifs).toHaveLength(1);
      expect(notifs[0].category).toBe("TRANSACTIONAL");
      // data enriquecido: eventId desde el refId legado + economía de la orden
      expect(notifs[0].data).toMatchObject({
        paymentId: payment.id,
        refId: payment.refId,
        eventId: ids.eventId,
        quantity: 1,
        amount: 10500,
      });
    });

    it("re-webhook PAID → idempotente, no duplica la notificación", async () => {
      const payment = await prisma.payment.findFirstOrThrow({
        where: { personId: ids.buyerId, status: "PAID" },
      });
      const res = await post("/api/payments/webhook", {
        refId: payment.refId,
        status: "PAID",
      });
      expect(res.status).toBe(200);
      expect((await res.json()).duplicated).toBe(true);
      expect(await notifsFor(ids.buyerId, "payment.paid")).toHaveLength(1);
    });

    it("FAILED → notifica al buyer (payment.failed)", async () => {
      const payment = await prisma.payment.create({
        data: {
          orderType: "TICKET",
          refId: encodeTicketOrderRef(ids.eventId),
          personId: ids.buyerId,
          amount: 10500,
          fee: 0,
          net: 10500,
        },
      });

      const res = await post("/api/payments/webhook", {
        refId: payment.refId,
        status: "FAILED",
      });
      expect(res.status).toBe(200);

      const notifs = await notifsFor(ids.buyerId, "payment.failed");
      expect(notifs).toHaveLength(1);
      expect(notifs[0].category).toBe("TRANSACTIONAL");
      // payment.eventId es null (orden legacy por refId) → evento no resuelto
      expect(notifs[0].data).toMatchObject({
        paymentId: payment.id,
        refId: payment.refId,
        eventId: null,
      });
    });
  });

  // ═══════════════════════ WAITLIST ═══════════════════════
  describe("waitlist → notificación SOCIAL al promover", () => {
    it("promote → notifica al promovido (waitlist.promoted, data.eventId)", async () => {
      // C no tiene ticket (buyer sí — lo emitió el webhook PAID → 409 por regla)
      const join = await post(
        `/api/events/${ids.eventId}/waitlist`,
        {},
        cSession,
      );
      expect(join.status).toBe(201);

      const res = await post(
        `/api/events/${ids.eventId}/waitlist/promote`,
        {},
        producerSession,
      );
      expect(res.status).toBe(200);
      expect((await res.json()).status).toBe("PROMOTED");

      const notifs = await notifsFor(ids.cId, "waitlist.promoted");
      expect(notifs).toHaveLength(1);
      expect(notifs[0].category).toBe("SOCIAL");
      expect(notifs[0].data).toMatchObject({ eventId: ids.eventId });
    });
  });
});
