import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Test } from "@nestjs/testing";
import { ValidationPipe, type INestApplication } from "@nestjs/common";
import { AuthModule } from "../src/auth/auth.module";
import { AuthService } from "../src/auth/domain/auth.service";
import { SocialModule } from "../src/social/social.module";
import { PaymentsModule } from "../src/payments/payments.module";
import { PrismaService } from "../src/prisma.service";
// Controllers nuevos aún no registrados en SocialModule (wiring pendiente):
// se montan directo en el test module para cubrir el contrato HTTP.
import { MeRsvpController } from "../src/social/infrastructure/rsvp.controller";
import { VenuesController } from "../src/social/infrastructure/venues.controller";
import { PartnerRequestsController } from "../src/social/infrastructure/partner-requests.controller";
import { AvailabilityController } from "../src/social/infrastructure/availability.controller";

describe("social endpoints e2e", () => {
  let app: INestApplication;
  let baseUrl: string;
  let prisma: PrismaService;
  const auth = new AuthService(
    process.env.JWT_SECRET ?? "dev-secret-change-me",
  );

  let sessionA: string;
  let sessionB: string;
  let sessionC: string;
  let sessionD: string;

  const ids = {
    personAId: "",
    personBId: "",
    personCId: "",
    personDId: "",
    venueActiveId: "",
    venueInactiveId: "",
    eventId: "",
    styleId: "",
    partnerOpenAId: "",
    partnerOpenBId: "",
    partnerClosedId: "",
    ticketActiveId: "",
    ticketUsedId: "",
  };

  const EMAIL_C = "se-recipient@test.local";
  const EMAIL_B = "se-owner@test.local";

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
      imports: [SocialModule, PaymentsModule, AuthModule],
      controllers: [
        MeRsvpController,
        VenuesController,
        PartnerRequestsController,
        AvailabilityController,
      ],
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
    const a = await prisma.person.create({
      data: {
        name: "SE Persona A",
        roles: { create: [{ role: "DANCER", status: "APPROVED" }] },
      },
    });
    ids.personAId = a.id;
    sessionA = await auth.issueSession(a.id);

    const b = await prisma.person.create({
      data: {
        name: "SE Persona B",
        email: EMAIL_B,
        roles: { create: [{ role: "DANCER", status: "APPROVED" }] },
      },
    });
    ids.personBId = b.id;
    sessionB = await auth.issueSession(b.id);

    const c = await prisma.person.create({
      data: {
        name: "SE Persona C",
        email: EMAIL_C,
        roles: { create: [{ role: "DANCER", status: "APPROVED" }] },
      },
    });
    ids.personCId = c.id;
    sessionC = await auth.issueSession(c.id);

    const d = await prisma.person.create({
      data: {
        name: "SE Persona D",
        roles: { create: [{ role: "DANCER", status: "APPROVED" }] },
      },
    });
    ids.personDId = d.id;
    sessionD = await auth.issueSession(d.id);

    const venueActive = await prisma.venue.create({
      data: { name: "SE Venue Activo", address: "Calle 1", capacity: 100 },
    });
    ids.venueActiveId = venueActive.id;
    const venueInactive = await prisma.venue.create({
      data: { name: "SE Venue Inactivo", active: false },
    });
    ids.venueInactiveId = venueInactive.id;

    const event = await prisma.event.create({
      data: {
        venueId: venueActive.id,
        name: "SE Evento",
        status: "PUBLISHED",
        startsAt: new Date(Date.now() + 24 * 3600 * 1000),
        endsAt: new Date(Date.now() + 30 * 3600 * 1000),
      },
    });
    ids.eventId = event.id;

    const style = await prisma.style.create({
      data: { name: "SE Style", genre: "SALSA" },
    });
    ids.styleId = style.id;

    // RSVP de A y B en el evento
    await prisma.rsvp.create({
      data: { eventId: event.id, personId: a.id, status: "GOING" },
    });
    await prisma.rsvp.create({
      data: { eventId: event.id, personId: b.id, status: "INTERESTED" },
    });

    // Partner requests: A y B OPEN (createdAt controlado), C CLOSED
    const pr1 = await prisma.practicePartnerRequest.create({
      data: {
        personId: a.id,
        styleId: style.id,
        role: "LEADER",
        level: "intermedio",
        location: "SE-LOC",
        note: "busco follower",
        createdAt: new Date(Date.now() - 60 * 1000),
      },
    });
    ids.partnerOpenAId = pr1.id;
    const pr2 = await prisma.practicePartnerRequest.create({
      data: {
        personId: b.id,
        role: "FOLLOWER",
        location: "SE-LOC",
        createdAt: new Date(),
      },
    });
    ids.partnerOpenBId = pr2.id;
    const pr3 = await prisma.practicePartnerRequest.create({
      data: {
        personId: c.id,
        location: "SE-LOC",
        status: "CLOSED",
        createdAt: new Date(Date.now() + 60 * 1000),
      },
    });
    ids.partnerClosedId = pr3.id;

    // Availability: D expirado (no debe salir en el feed)
    await prisma.availabilityToggle.create({
      data: {
        personId: d.id,
        available: true,
        until: new Date(Date.now() - 3600 * 1000),
      },
    });

    // Tickets de B: uno ACTIVE, uno USED
    const tActive = await prisma.ticket.create({
      data: {
        eventId: event.id,
        ownerId: b.id,
        buyerId: a.id, // comprador ≠ dueño — no debe cambiar al transferir
        listPrice: 5000,
        serviceFee: 500,
      },
    });
    ids.ticketActiveId = tActive.id;
    const tUsed = await prisma.ticket.create({
      data: {
        eventId: event.id,
        ownerId: b.id,
        buyerId: b.id,
        listPrice: 5000,
        serviceFee: 500,
        status: "USED",
      },
    });
    ids.ticketUsedId = tUsed.id;
  });

  afterAll(async () => {
    const peopleIds = [
      ids.personAId,
      ids.personBId,
      ids.personCId,
      ids.personDId,
    ];
    await prisma.practicePartnerRequest.deleteMany({
      where: { personId: { in: peopleIds } },
    });
    await prisma.availabilityToggle.deleteMany({
      where: { personId: { in: peopleIds } },
    });
    await prisma.rsvp.deleteMany({ where: { eventId: ids.eventId } });
    await prisma.ticket.deleteMany({ where: { eventId: ids.eventId } });
    await prisma.event.delete({ where: { id: ids.eventId } });
    await prisma.style.delete({ where: { id: ids.styleId } });
    await prisma.venue.deleteMany({
      where: { id: { in: [ids.venueActiveId, ids.venueInactiveId] } },
    });
    await prisma.personRole.deleteMany({
      where: { personId: { in: peopleIds } },
    });
    await prisma.person.deleteMany({ where: { id: { in: peopleIds } } });
    await app.close();
  });

  // ═══════════════════════ GET /api/me/rsvp ═══════════════════════
  describe("GET /api/me/rsvp", () => {
    it("sin sesión → 401", async () => {
      const res = await fetch(`${baseUrl}/api/me/rsvp`);
      expect(res.status).toBe(401);
    });

    it("devuelve solo mis RSVP con {eventId,status,createdAt}", async () => {
      const res = await fetch(`${baseUrl}/api/me/rsvp`, {
        headers: { cookie: `omnidance_session=${sessionA}` },
      });
      expect(res.status).toBe(200);
      const list = await res.json();
      expect(list).toHaveLength(1);
      expect(list[0].eventId).toBe(ids.eventId);
      expect(list[0].status).toBe("GOING");
      expect(list[0]).toHaveProperty("createdAt");
      expect(list[0]).not.toHaveProperty("personId");
    });

    it("otro usuario ve su propio RSVP (INTERESTED)", async () => {
      const res = await fetch(`${baseUrl}/api/me/rsvp`, {
        headers: { cookie: `omnidance_session=${sessionB}` },
      });
      const list = await res.json();
      expect(list).toHaveLength(1);
      expect(list[0].status).toBe("INTERESTED");
    });
  });

  // ═══════════════════════ GET /api/venues ═══════════════════════
  describe("GET /api/venues", () => {
    it("público: lista activos ordenados por name, sin inactivos", async () => {
      const res = await fetch(`${baseUrl}/api/venues`);
      expect(res.status).toBe(200);
      const venues = await res.json();
      expect(Array.isArray(venues)).toBe(true);

      const found = venues.find((v: { id: string }) => v.id === ids.venueActiveId);
      expect(found).toMatchObject({
        name: "SE Venue Activo",
        address: "Calle 1",
        capacity: 100,
      });
      expect(
        venues.some((v: { id: string }) => v.id === ids.venueInactiveId),
      ).toBe(false);

      const names = venues.map((v: { name: string }) => v.name);
      expect([...names].sort((a, b) => a.localeCompare(b))).toEqual(names);
      // shape contract: solo id/name/address/capacity
      for (const v of venues) {
        expect(Object.keys(v).sort()).toEqual(
          ["address", "capacity", "id", "name"].sort(),
        );
      }
    });
  });

  // ═══════════════════════ PARTNER REQUESTS ═══════════════════════
  describe("POST /api/partner-requests", () => {
    it("sin sesión → 401", async () => {
      const res = await req("POST", "/api/partner-requests", {});
      expect(res.status).toBe(401);
    });

    it("role inválido → 400", async () => {
      const res = await req(
        "POST",
        "/api/partner-requests",
        { role: "BOSS" },
        sessionA,
      );
      expect(res.status).toBe(400);
    });

    it("styleId inexistente → 400", async () => {
      const res = await req(
        "POST",
        "/api/partner-requests",
        { styleId: "style-fantasma" },
        sessionA,
      );
      expect(res.status).toBe(400);
    });

    it("crea solicitud OPEN con el personId del session", async () => {
      const res = await req(
        "POST",
        "/api/partner-requests",
        {
          styleId: ids.styleId,
          role: "SWITCH",
          level: "avanzado",
          location: "SE-LOC-via-api",
          note: "nota",
        },
        sessionC,
      );
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.status).toBe("OPEN");
      expect(body.personId).toBe(ids.personCId);
      expect(body.role).toBe("SWITCH");
      expect(body.location).toBe("SE-LOC-via-api");
    });
  });

  describe("GET /api/partner-requests", () => {
    it("feed público: solo OPEN, desc por createdAt, con person y style", async () => {
      const res = await fetch(`${baseUrl}/api/partner-requests`);
      expect(res.status).toBe(200);
      const feed = await res.json();
      const mine = feed.filter((r: { location: string | null }) =>
        r.location?.startsWith("SE-LOC"),
      );

      // CLOSED (createdAt más reciente) no debe aparecer
      expect(
        mine.some((r: { id: string }) => r.id === ids.partnerClosedId),
      ).toBe(false);

      // desc por createdAt: el de B (más reciente) antes que el de A
      const idxB = mine.findIndex(
        (r: { id: string }) => r.id === ids.partnerOpenBId,
      );
      const idxA = mine.findIndex(
        (r: { id: string }) => r.id === ids.partnerOpenAId,
      );
      expect(idxB).toBeGreaterThanOrEqual(0);
      expect(idxA).toBeGreaterThanOrEqual(0);
      expect(idxB).toBeLessThan(idxA);

      const reqA = mine.find(
        (r: { id: string }) => r.id === ids.partnerOpenAId,
      );
      expect(reqA).toMatchObject({
        person: { id: ids.personAId, name: "SE Persona A" },
        styleId: ids.styleId,
        style: { name: "SE Style" },
        role: "LEADER",
        level: "intermedio",
        note: "busco follower",
      });
      expect(reqA.person).toHaveProperty("photoUrl");
      expect(reqA).toHaveProperty("createdAt");

      const reqB = mine.find(
        (r: { id: string }) => r.id === ids.partnerOpenBId,
      );
      expect(reqB.styleId).toBeNull();
      expect(reqB.style).toBeNull();
    });
  });

  describe("POST /api/partner-requests/:id/close", () => {
    it("sin sesión → 401", async () => {
      const res = await req(
        "POST",
        `/api/partner-requests/${ids.partnerOpenAId}/close`,
        {},
      );
      expect(res.status).toBe(401);
    });

    it("inexistente → 404", async () => {
      const res = await req(
        "POST",
        "/api/partner-requests/pr-fantasma/close",
        {},
        sessionA,
      );
      expect(res.status).toBe(404);
    });

    it("no dueño → 403", async () => {
      const res = await req(
        "POST",
        `/api/partner-requests/${ids.partnerOpenAId}/close`,
        {},
        sessionB,
      );
      expect(res.status).toBe(403);
    });

    it("dueño → 200 status CLOSED y sale del feed", async () => {
      const res = await req(
        "POST",
        `/api/partner-requests/${ids.partnerOpenAId}/close`,
        {},
        sessionA,
      );
      expect(res.status).toBe(200);
      expect((await res.json()).status).toBe("CLOSED");

      const feed = await (await fetch(`${baseUrl}/api/partner-requests`)).json();
      expect(
        feed.some((r: { id: string }) => r.id === ids.partnerOpenAId),
      ).toBe(false);
    });
  });

  // ═══════════════════════ AVAILABILITY ═══════════════════════
  describe("POST /api/availability", () => {
    it("sin sesión → 401", async () => {
      const res = await req("POST", "/api/availability", { available: true });
      expect(res.status).toBe(401);
    });

    it("available inválido → 400", async () => {
      const res = await req(
        "POST",
        "/api/availability",
        { available: "si" },
        sessionA,
      );
      expect(res.status).toBe(400);
    });

    it("upsert: crea el toggle", async () => {
      const res = await req(
        "POST",
        "/api/availability",
        {
          available: true,
          until: new Date(Date.now() + 2 * 3600 * 1000).toISOString(),
          location: "SE-LOC",
        },
        sessionA,
      );
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.personId).toBe(ids.personAId);
      expect(body.available).toBe(true);
      expect(body.location).toBe("SE-LOC");
    });

    it("segundo POST actualiza la misma fila (unique personId)", async () => {
      const res = await req(
        "POST",
        "/api/availability",
        { available: true, location: "SE-LOC-2" },
        sessionA,
      );
      expect(res.status).toBe(201);
      expect((await res.json()).location).toBe("SE-LOC-2");
      const count = await prisma.availabilityToggle.count({
        where: { personId: ids.personAId },
      });
      expect(count).toBe(1);
    });
  });

  describe("GET /api/availability", () => {
    it("feed público: solo vigentes, con person{id,name,photoUrl}", async () => {
      // B no disponible → no sale
      await req(
        "POST",
        "/api/availability",
        { available: false, location: "SE-LOC" },
        sessionB,
      );

      const res = await fetch(`${baseUrl}/api/availability`);
      expect(res.status).toBe(200);
      const feed = await res.json();

      // A vigente (until null tras el último POST)
      const a = feed.find(
        (t: { person: { id: string } }) => t.person.id === ids.personAId,
      );
      expect(a).toBeDefined();
      expect(a.person).toMatchObject({ id: ids.personAId, name: "SE Persona A" });
      expect(a.person).toHaveProperty("photoUrl");
      expect(a.location).toBe("SE-LOC-2");
      expect(a).toHaveProperty("updatedAt");
      expect(a).toHaveProperty("until");

      // B apagado y D expirado → ausentes
      expect(
        feed.some((t: { person: { id: string } }) => t.person.id === ids.personBId),
      ).toBe(false);
      expect(
        feed.some((t: { person: { id: string } }) => t.person.id === ids.personDId),
      ).toBe(false);
    });
  });

  // ═══════════════════════ TICKET TRANSFER ═══════════════════════
  describe("POST /api/tickets/:id/transfer", () => {
    it("sin sesión → 401", async () => {
      const res = await req("POST", `/api/tickets/${ids.ticketActiveId}/transfer`, {
        toEmail: EMAIL_C,
      });
      expect(res.status).toBe(401);
    });

    it("ticket inexistente → 404", async () => {
      const res = await req(
        "POST",
        "/api/tickets/tkt-fantasma/transfer",
        { toEmail: EMAIL_C },
        sessionB,
      );
      expect(res.status).toBe(404);
    });

    it("no dueño → 403", async () => {
      const res = await req(
        "POST",
        `/api/tickets/${ids.ticketActiveId}/transfer`,
        { toEmail: EMAIL_C },
        sessionA,
      );
      expect(res.status).toBe(403);
    });

    it("ticket no ACTIVE → 409", async () => {
      const res = await req(
        "POST",
        `/api/tickets/${ids.ticketUsedId}/transfer`,
        { toEmail: EMAIL_C },
        sessionB,
      );
      expect(res.status).toBe(409);
    });

    it("email inexistente → 400", async () => {
      const res = await req(
        "POST",
        `/api/tickets/${ids.ticketActiveId}/transfer`,
        { toEmail: "nadie@test.local" },
        sessionB,
      );
      expect(res.status).toBe(400);
    });

    it("mismo dueño → 400", async () => {
      const res = await req(
        "POST",
        `/api/tickets/${ids.ticketActiveId}/transfer`,
        { toEmail: EMAIL_B },
        sessionB,
      );
      expect(res.status).toBe(400);
    });

    it("toEmail inválido → 400", async () => {
      const res = await req(
        "POST",
        `/api/tickets/${ids.ticketActiveId}/transfer`,
        { toEmail: "no-es-email" },
        sessionB,
      );
      expect(res.status).toBe(400);
    });

    it("transfiere: ownerId→destinatario, giftedFromId→ex-dueño, buyerId intacto", async () => {
      const res = await req(
        "POST",
        `/api/tickets/${ids.ticketActiveId}/transfer`,
        { toEmail: EMAIL_C },
        sessionB,
      );
      expect(res.status).toBe(200);
      const ticket = await res.json();
      expect(ticket.ownerId).toBe(ids.personCId);
      expect(ticket.giftedFromId).toBe(ids.personBId);
      expect(ticket.buyerId).toBe(ids.personAId);
      expect(ticket.status).toBe("ACTIVE");

      // el ticket ahora aparece en /tickets/mine del destinatario
      const mine = await (
        await fetch(`${baseUrl}/api/tickets/mine`, {
          headers: { cookie: `omnidance_session=${sessionC}` },
        })
      ).json();
      expect(mine.some((t: { id: string }) => t.id === ids.ticketActiveId)).toBe(
        true,
      );
    });
  });
});
