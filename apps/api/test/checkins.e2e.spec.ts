import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Test } from "@nestjs/testing";
import { ValidationPipe, type INestApplication } from "@nestjs/common";
import { AuthModule } from "../src/auth/auth.module";
import { AuthService } from "../src/auth/domain/auth.service";
import { CheckinsModule } from "../src/checkins/checkins.module";
import { PrismaService } from "../src/prisma.service";
import { QrModule } from "../src/qr/qr.module";
import { QrService } from "../src/qr/domain/qr.service";

describe("checkins e2e", () => {
  let app: INestApplication;
  let baseUrl: string;
  let prisma: PrismaService;
  const auth = new AuthService(
    process.env.JWT_SECRET ?? "dev-secret-change-me",
  );
  const qr = new QrService(process.env.QR_SECRET ?? "dev-qr-secret-change-me");

  let staffSession: string;
  let dancerSession: string;
  let staffId: string;

  const ids = {
    venueId: "",
    eventId: "",
    attendeeId: "",
    attendeeNoTicketId: "",
    dancerId: "",
    ticketId: "",
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

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [CheckinsModule, AuthModule, QrModule],
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
    staffId = admin.id;
    staffSession = await auth.issueSession(admin.id);

    const venue = await prisma.venue.create({
      data: { name: "Venue Checkins Test" },
    });
    ids.venueId = venue.id;

    const event = await prisma.event.create({
      data: {
        venueId: venue.id,
        name: "Evento Checkins Test",
        status: "PUBLISHED",
        startsAt: new Date(),
        endsAt: new Date(Date.now() + 4 * 3600 * 1000),
      },
    });
    ids.eventId = event.id;

    const attendee = await prisma.person.create({
      data: { name: "Asistente Con Ticket" },
    });
    ids.attendeeId = attendee.id;

    const noTicket = await prisma.person.create({
      data: { name: "Asistente Sin Ticket" },
    });
    ids.attendeeNoTicketId = noTicket.id;

    const dancer = await prisma.person.create({
      data: {
        name: "Bailarín Sin Rol Staff",
        roles: { create: [{ role: "DANCER", status: "APPROVED" }] },
      },
    });
    ids.dancerId = dancer.id;
    dancerSession = await auth.issueSession(dancer.id);

    const ticket = await prisma.ticket.create({
      data: {
        eventId: event.id,
        ownerId: attendee.id,
        buyerId: attendee.id,
        listPrice: 5000,
        serviceFee: 500,
      },
    });
    ids.ticketId = ticket.id;
  });

  afterAll(async () => {
    await prisma.checkin.deleteMany({
      where: { eventId: ids.eventId },
    });
    await prisma.ticket.deleteMany({ where: { eventId: ids.eventId } });
    await prisma.event.delete({ where: { id: ids.eventId } });
    await prisma.venue.delete({ where: { id: ids.venueId } });
    await prisma.personRole.deleteMany({
      where: { personId: ids.dancerId },
    });
    await prisma.person.deleteMany({
      where: {
        id: { in: [ids.attendeeId, ids.attendeeNoTicketId, ids.dancerId] },
      },
    });
    await app.close();
  });

  describe("POST /api/checkins", () => {
    it("sin sesión → 401", async () => {
      const res = await post("/api/checkins", {
        qrToken: "x",
        eventId: ids.eventId,
      });
      expect(res.status).toBe(401);
    });

    it("sesión sin rol STAFF/ADMIN → 403", async () => {
      const res = await post(
        "/api/checkins",
        { qrToken: "x", eventId: ids.eventId },
        dancerSession,
      );
      expect(res.status).toBe(403);
    });

    it("qrToken inválido → 400", async () => {
      const res = await post(
        "/api/checkins",
        { qrToken: "token-basura", eventId: ids.eventId },
        staffSession,
      );
      expect(res.status).toBe(400);
    });

    it("evento inexistente → 404", async () => {
      const { token } = await qr.mint(ids.attendeeId);
      const res = await post(
        "/api/checkins",
        { qrToken: token, eventId: "evt-no-existe" },
        staffSession,
      );
      expect(res.status).toBe(404);
    });

    it("scan válido → 201 con checkin, person y ticket marcado USED", async () => {
      const { token } = await qr.mint(ids.attendeeId);
      const res = await post(
        "/api/checkins",
        { qrToken: token, eventId: ids.eventId },
        staffSession,
      );
      expect(res.status).toBe(201);
      const body = await res.json();
      ids.checkinIds.push(body.checkin.id);
      expect(body.checkin.eventId).toBe(ids.eventId);
      expect(body.checkin.personId).toBe(ids.attendeeId);
      expect(body.checkin.staffId).toBe(staffId);
      expect(body.checkin.method).toBe("SCAN");
      expect(body.checkin.passId).toBe(ids.ticketId);
      expect(body.person.name).toBe("Asistente Con Ticket");
      expect(body.ticket).toEqual({ id: ids.ticketId, status: "USED" });

      const ticket = await prisma.ticket.findUniqueOrThrow({
        where: { id: ids.ticketId },
      });
      expect(ticket.status).toBe("USED");
    });

    it("segundo scan de la misma persona → 409 con el checkin existente", async () => {
      const { token } = await qr.mint(ids.attendeeId);
      const res = await post(
        "/api/checkins",
        { qrToken: token, eventId: ids.eventId },
        staffSession,
      );
      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.checkin.id).toBe(ids.checkinIds[0]);
    });
  });

  describe("POST /api/checkins/manual", () => {
    it("sin sesión → 401", async () => {
      const res = await post("/api/checkins/manual", {
        eventId: ids.eventId,
        personId: ids.attendeeNoTicketId,
      });
      expect(res.status).toBe(401);
    });

    it("persona sin ticket → 201 MANUAL con passId null, ticket null y staffId", async () => {
      const res = await post(
        "/api/checkins/manual",
        { eventId: ids.eventId, personId: ids.attendeeNoTicketId },
        staffSession,
      );
      expect(res.status).toBe(201);
      const body = await res.json();
      ids.checkinIds.push(body.checkin.id);
      expect(body.checkin.method).toBe("MANUAL");
      expect(body.checkin.passId).toBeNull();
      expect(body.checkin.staffId).toBe(staffId);
      expect(body.ticket).toBeNull();
      expect(body.person.name).toBe("Asistente Sin Ticket");
    });

    it("doble check-in manual → 409", async () => {
      const res = await post(
        "/api/checkins/manual",
        { eventId: ids.eventId, personId: ids.attendeeNoTicketId },
        staffSession,
      );
      expect(res.status).toBe(409);
    });

    it("persona inexistente → 404", async () => {
      const res = await post(
        "/api/checkins/manual",
        { eventId: ids.eventId, personId: "persona-fantasma" },
        staffSession,
      );
      expect(res.status).toBe(404);
    });

    it("sesión sin rol STAFF/ADMIN → 403", async () => {
      const res = await post(
        "/api/checkins/manual",
        { eventId: ids.eventId, personId: ids.attendeeNoTicketId },
        dancerSession,
      );
      expect(res.status).toBe(403);
    });
  });

  describe("GET /api/events/:eventId/checkins", () => {
    it("lista checkins del evento con person, inAt, method y passId", async () => {
      const res = await fetch(
        `${baseUrl}/api/events/${ids.eventId}/checkins`,
        { headers: { cookie: `omnidance_session=${staffSession}` } },
      );
      expect(res.status).toBe(200);
      const list = await res.json();
      expect(Array.isArray(list)).toBe(true);
      expect(list.length).toBeGreaterThanOrEqual(2);
      const scan = list.find(
        (c: { personId: string }) => c.personId === ids.attendeeId,
      );
      expect(scan.person.name).toBe("Asistente Con Ticket");
      expect(scan.method).toBe("SCAN");
      expect(scan.passId).toBe(ids.ticketId);
      expect(scan.inAt).toBeTruthy();
      const manual = list.find(
        (c: { personId: string }) => c.personId === ids.attendeeNoTicketId,
      );
      expect(manual.method).toBe("MANUAL");
      expect(manual.passId).toBeNull();
    });

    it("sin sesión → 401", async () => {
      const res = await fetch(`${baseUrl}/api/events/${ids.eventId}/checkins`);
      expect(res.status).toBe(401);
    });

    it("sin rol STAFF/ADMIN → 403", async () => {
      const res = await fetch(
        `${baseUrl}/api/events/${ids.eventId}/checkins`,
        { headers: { cookie: `omnidance_session=${dancerSession}` } },
      );
      expect(res.status).toBe(403);
    });

    it("evento inexistente → 404", async () => {
      const res = await fetch(
        `${baseUrl}/api/events/evt-no-existe/checkins`,
        { headers: { cookie: `omnidance_session=${staffSession}` } },
      );
      expect(res.status).toBe(404);
    });
  });
});
