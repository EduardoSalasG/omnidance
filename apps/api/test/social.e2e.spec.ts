import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Test } from "@nestjs/testing";
import { ValidationPipe, type INestApplication } from "@nestjs/common";
import { AuthModule } from "../src/auth/auth.module";
import { AuthService } from "../src/auth/domain/auth.service";
import { SocialModule } from "../src/social/social.module";
import { PrismaService } from "../src/prisma.service";

describe("social e2e", () => {
  let app: INestApplication;
  let baseUrl: string;
  let prisma: PrismaService;
  const auth = new AuthService(
    process.env.JWT_SECRET ?? "dev-secret-change-me",
  );

  let producerSession: string;
  let dancerSession: string;
  let dancer2Session: string;
  let dancer3Session: string;

  const ids = {
    venueId: "",
    eventId: "",
    producerId: "",
    dancerId: "",
    dancer2Id: "",
    dancer3Id: "",
    guestListId: "",
    styleId: "",
    practiceEventIds: [] as string[],
    ticketId: "",
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
      imports: [SocialModule, AuthModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api");
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    await app.listen(0);
    prisma = app.get(PrismaService);
    const address = app.getHttpServer().address();
    baseUrl = `http://127.0.0.1:${address.port}`;

    // ─── datos de prueba (autocontenidos, sin depender del seed) ───
    const mkPerson = (name: string, role: "PRODUCER" | "DANCER") =>
      prisma.person.create({
        data: {
          name,
          roles: { create: [{ role, status: "APPROVED" }] },
        },
      });

    const producer = await mkPerson("Productor Social Test", "PRODUCER");
    ids.producerId = producer.id;
    producerSession = await auth.issueSession(producer.id);

    const dancer = await mkPerson("Bailarín Social Uno", "DANCER");
    ids.dancerId = dancer.id;
    dancerSession = await auth.issueSession(dancer.id);

    const dancer2 = await mkPerson("Bailarín Social Dos", "DANCER");
    ids.dancer2Id = dancer2.id;
    dancer2Session = await auth.issueSession(dancer2.id);

    const dancer3 = await mkPerson("Bailarín Social Tres", "DANCER");
    ids.dancer3Id = dancer3.id;
    dancer3Session = await auth.issueSession(dancer3.id);

    const venue = await prisma.venue.create({
      data: { name: "Venue Social Test" },
    });
    ids.venueId = venue.id;

    const event = await prisma.event.create({
      data: {
        venueId: venue.id,
        name: "Evento Social Test",
        status: "PUBLISHED",
        startsAt: new Date(Date.now() + 24 * 3600 * 1000),
        endsAt: new Date(Date.now() + 30 * 3600 * 1000),
      },
    });
    ids.eventId = event.id;

    const style = await prisma.style.create({
      data: { name: "Estilo Social Test", genre: "SALSA" },
    });
    ids.styleId = style.id;
  });

  afterAll(async () => {
    const eventIds = [ids.eventId, ...ids.practiceEventIds];
    const peopleIds = [
      ids.producerId,
      ids.dancerId,
      ids.dancer2Id,
      ids.dancer3Id,
    ];
    await prisma.guestListEntry.deleteMany({
      where: { guestListId: ids.guestListId },
    });
    await prisma.guestList.deleteMany({ where: { eventId: ids.eventId } });
    await prisma.waitlist.deleteMany({ where: { eventId: ids.eventId } });
    await prisma.rsvp.deleteMany({ where: { eventId: { in: eventIds } } });
    await prisma.scheduleBlock.deleteMany({
      where: { eventId: { in: ids.practiceEventIds } },
    });
    await prisma.trip.deleteMany({ where: { personId: { in: peopleIds } } });
    await prisma.ticket.deleteMany({ where: { eventId: ids.eventId } });
    await prisma.event.deleteMany({ where: { id: { in: eventIds } } });
    await prisma.style.delete({ where: { id: ids.styleId } });
    await prisma.venue.delete({ where: { id: ids.venueId } });
    await prisma.personRole.deleteMany({
      where: { personId: { in: peopleIds } },
    });
    await prisma.person.deleteMany({ where: { id: { in: peopleIds } } });
    await app.close();
  });

  // ═══════════════════════ RSVP ═══════════════════════
  describe("PUT /api/events/:eventId/rsvp", () => {
    it("sin sesión → 401", async () => {
      const res = await req("PUT", `/api/events/${ids.eventId}/rsvp`, {
        status: "GOING",
      });
      expect(res.status).toBe(401);
    });

    it("status inválido → 400", async () => {
      const res = await req(
        "PUT",
        `/api/events/${ids.eventId}/rsvp`,
        { status: "MAYBE" },
        dancerSession,
      );
      expect(res.status).toBe(400);
    });

    it("evento inexistente → 404", async () => {
      const res = await req(
        "PUT",
        "/api/events/evt-no-existe/rsvp",
        { status: "GOING" },
        dancerSession,
      );
      expect(res.status).toBe(404);
    });

    it("GOING → 200 y crea el rsvp", async () => {
      const res = await req(
        "PUT",
        `/api/events/${ids.eventId}/rsvp`,
        { status: "GOING" },
        dancerSession,
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("GOING");
      expect(body.eventId).toBe(ids.eventId);
      expect(body.personId).toBe(ids.dancerId);
    });

    it("segunda persona GOING → 200", async () => {
      const res = await req(
        "PUT",
        `/api/events/${ids.eventId}/rsvp`,
        { status: "GOING" },
        dancer2Session,
      );
      expect(res.status).toBe(200);
    });

    it("re-PUT con INTERESTED hace upsert (una sola fila)", async () => {
      const res = await req(
        "PUT",
        `/api/events/${ids.eventId}/rsvp`,
        { status: "INTERESTED" },
        dancerSession,
      );
      expect(res.status).toBe(200);
      expect((await res.json()).status).toBe("INTERESTED");
      const count = await prisma.rsvp.count({
        where: { eventId: ids.eventId, personId: ids.dancerId },
      });
      expect(count).toBe(1);
    });
  });

  describe("GET /api/events/:eventId/rsvps", () => {
    it("público: devuelve solo contadores", async () => {
      const res = await fetch(
        `${baseUrl}/api/events/${ids.eventId}/rsvps`,
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ going: 1, interested: 1 });
    });
  });

  describe("GET /api/events/:eventId/attendees", () => {
    it("sin sesión → 401", async () => {
      const res = await fetch(
        `${baseUrl}/api/events/${ids.eventId}/attendees`,
      );
      expect(res.status).toBe(401);
    });

    it("devuelve solo GOING con personId, name y photoUrl", async () => {
      const res = await fetch(
        `${baseUrl}/api/events/${ids.eventId}/attendees`,
        { headers: { cookie: `omnidance_session=${dancerSession}` } },
      );
      expect(res.status).toBe(200);
      const list = await res.json();
      expect(Array.isArray(list)).toBe(true);
      expect(list).toHaveLength(1);
      expect(list[0]).toMatchObject({
        personId: ids.dancer2Id,
        name: "Bailarín Social Dos",
      });
      expect(list[0]).toHaveProperty("photoUrl");
    });
  });

  describe("DELETE /api/events/:eventId/rsvp", () => {
    it("sin sesión → 401", async () => {
      const res = await req("DELETE", `/api/events/${ids.eventId}/rsvp`);
      expect(res.status).toBe(401);
    });

    it("borra el propio RSVP", async () => {
      const res = await req(
        "DELETE",
        `/api/events/${ids.eventId}/rsvp`,
        undefined,
        dancerSession,
      );
      expect(res.status).toBe(200);
      const gone = await prisma.rsvp.findUnique({
        where: {
          eventId_personId: {
            eventId: ids.eventId,
            personId: ids.dancerId,
          },
        },
      });
      expect(gone).toBeNull();
    });

    it("segundo DELETE → 404", async () => {
      const res = await req(
        "DELETE",
        `/api/events/${ids.eventId}/rsvp`,
        undefined,
        dancerSession,
      );
      expect(res.status).toBe(404);
    });
  });

  // ═══════════════════════ GUEST LISTS ═══════════════════════
  describe("POST /api/events/:eventId/guest-lists", () => {
    it("sin sesión → 401", async () => {
      const res = await req("POST", `/api/events/${ids.eventId}/guest-lists`, {
        ownerId: ids.dancerId,
      });
      expect(res.status).toBe(401);
    });

    it("sin rol PRODUCER/STAFF/ADMIN → 403", async () => {
      const res = await req(
        "POST",
        `/api/events/${ids.eventId}/guest-lists`,
        { ownerId: ids.dancerId },
        dancerSession,
      );
      expect(res.status).toBe(403);
    });

    it("evento inexistente → 404", async () => {
      const res = await req(
        "POST",
        "/api/events/evt-no-existe/guest-lists",
        { ownerId: ids.dancerId },
        producerSession,
      );
      expect(res.status).toBe(404);
    });

    it("owner inexistente → 404", async () => {
      const res = await req(
        "POST",
        `/api/events/${ids.eventId}/guest-lists`,
        { ownerId: "persona-fantasma" },
        producerSession,
      );
      expect(res.status).toBe(404);
    });

    it("como producer → 201 con la lista creada", async () => {
      const res = await req(
        "POST",
        `/api/events/${ids.eventId}/guest-lists`,
        {
          ownerId: ids.dancerId,
          label: "Cumpleaños de Bailarín Uno",
          specialPrice: 4000,
        },
        producerSession,
      );
      expect(res.status).toBe(201);
      const body = await res.json();
      ids.guestListId = body.id;
      expect(body.eventId).toBe(ids.eventId);
      expect(body.ownerId).toBe(ids.dancerId);
      expect(body.label).toBe("Cumpleaños de Bailarín Uno");
      expect(body.specialPrice).toBe(4000);
      expect(body.entries).toEqual([]);
    });
  });

  describe("POST /api/guest-lists/:id/entries", () => {
    it("sin sesión → 401", async () => {
      const res = await req("POST", `/api/guest-lists/${ids.guestListId}/entries`, {
        personId: ids.dancer2Id,
      });
      expect(res.status).toBe(401);
    });

    it("sin rol staff → 403", async () => {
      const res = await req(
        "POST",
        `/api/guest-lists/${ids.guestListId}/entries`,
        { personId: ids.dancer2Id },
        dancerSession,
      );
      expect(res.status).toBe(403);
    });

    it("lista inexistente → 404", async () => {
      const res = await req(
        "POST",
        "/api/guest-lists/lista-fantasma/entries",
        { personId: ids.dancer2Id },
        producerSession,
      );
      expect(res.status).toBe(404);
    });

    it("persona inexistente → 404", async () => {
      const res = await req(
        "POST",
        `/api/guest-lists/${ids.guestListId}/entries`,
        { personId: "persona-fantasma" },
        producerSession,
      );
      expect(res.status).toBe(404);
    });

    it("agrega entry PENDING con datos de person", async () => {
      const res = await req(
        "POST",
        `/api/guest-lists/${ids.guestListId}/entries`,
        { personId: ids.dancer2Id },
        producerSession,
      );
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.status).toBe("PENDING");
      expect(body.personId).toBe(ids.dancer2Id);
      expect(body.person.name).toBe("Bailarín Social Dos");
    });

    it("duplicado → 409", async () => {
      const res = await req(
        "POST",
        `/api/guest-lists/${ids.guestListId}/entries`,
        { personId: ids.dancer2Id },
        producerSession,
      );
      expect(res.status).toBe(409);
    });
  });

  describe("GET /api/events/:eventId/guest-lists", () => {
    it("sin rol staff → 403", async () => {
      const res = await fetch(
        `${baseUrl}/api/events/${ids.eventId}/guest-lists`,
        { headers: { cookie: `omnidance_session=${dancerSession}` } },
      );
      expect(res.status).toBe(403);
    });

    it("devuelve listas con entries + person{name,photoUrl} y owner", async () => {
      const res = await fetch(
        `${baseUrl}/api/events/${ids.eventId}/guest-lists`,
        { headers: { cookie: `omnidance_session=${producerSession}` } },
      );
      expect(res.status).toBe(200);
      const lists = await res.json();
      expect(lists).toHaveLength(1);
      const list = lists[0];
      expect(list.id).toBe(ids.guestListId);
      expect(list.owner.name).toBe("Bailarín Social Uno");
      expect(list.entries).toHaveLength(1);
      expect(list.entries[0].status).toBe("PENDING");
      expect(list.entries[0].person.name).toBe("Bailarín Social Dos");
    });
  });

  // ═══════════════════════ WAITLIST ═══════════════════════
  describe("POST /api/events/:eventId/waitlist", () => {
    it("sin sesión → 401", async () => {
      const res = await req("POST", `/api/events/${ids.eventId}/waitlist`, {});
      expect(res.status).toBe(401);
    });

    it("evento inexistente → 404", async () => {
      const res = await req(
        "POST",
        "/api/events/evt-no-existe/waitlist",
        {},
        dancerSession,
      );
      expect(res.status).toBe(404);
    });

    it("join → 201 posición 1 WAITING", async () => {
      const res = await req(
        "POST",
        `/api/events/${ids.eventId}/waitlist`,
        {},
        dancerSession,
      );
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.position).toBe(1);
      expect(body.status).toBe("WAITING");
      expect(body.personId).toBe(ids.dancerId);
    });

    it("segunda persona → posición 2", async () => {
      const res = await req(
        "POST",
        `/api/events/${ids.eventId}/waitlist`,
        {},
        dancer2Session,
      );
      expect(res.status).toBe(201);
      expect((await res.json()).position).toBe(2);
    });

    it("join duplicado → 409", async () => {
      const res = await req(
        "POST",
        `/api/events/${ids.eventId}/waitlist`,
        {},
        dancerSession,
      );
      expect(res.status).toBe(409);
    });
  });

  describe("GET /api/events/:eventId/waitlist/me", () => {
    it("sin sesión → 401", async () => {
      const res = await fetch(
        `${baseUrl}/api/events/${ids.eventId}/waitlist/me`,
      );
      expect(res.status).toBe(401);
    });

    it("devuelve { position, status }", async () => {
      const res = await fetch(
        `${baseUrl}/api/events/${ids.eventId}/waitlist/me`,
        { headers: { cookie: `omnidance_session=${dancerSession}` } },
      );
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ position: 1, status: "WAITING" });
    });

    it("no inscrito → 404", async () => {
      const res = await fetch(
        `${baseUrl}/api/events/${ids.eventId}/waitlist/me`,
        { headers: { cookie: `omnidance_session=${producerSession}` } },
      );
      expect(res.status).toBe(404);
    });
  });

  describe("POST /api/events/:eventId/waitlist/promote", () => {
    it("sin rol staff → 403", async () => {
      const res = await req(
        "POST",
        `/api/events/${ids.eventId}/waitlist/promote`,
        {},
        dancerSession,
      );
      expect(res.status).toBe(403);
    });

    it("promueve al primer WAITING → PROMOTED", async () => {
      const res = await req(
        "POST",
        `/api/events/${ids.eventId}/waitlist/promote`,
        {},
        producerSession,
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.personId).toBe(ids.dancerId);
      expect(body.status).toBe("PROMOTED");

      const me = await (
        await fetch(`${baseUrl}/api/events/${ids.eventId}/waitlist/me`, {
          headers: { cookie: `omnidance_session=${dancerSession}` },
        })
      ).json();
      expect(me.status).toBe("PROMOTED");
    });

    it("rejoin con PROMOTED vivo → 409", async () => {
      const res = await req(
        "POST",
        `/api/events/${ids.eventId}/waitlist`,
        {},
        dancerSession,
      );
      expect(res.status).toBe(409);
    });

    it("segundo promote → el siguiente WAITING", async () => {
      const res = await req(
        "POST",
        `/api/events/${ids.eventId}/waitlist/promote`,
        {},
        producerSession,
      );
      expect(res.status).toBe(200);
      expect((await res.json()).personId).toBe(ids.dancer2Id);
    });

    it("sin WAITING → 404", async () => {
      const res = await req(
        "POST",
        `/api/events/${ids.eventId}/waitlist/promote`,
        {},
        producerSession,
      );
      expect(res.status).toBe(404);
    });

    it("re-ingreso tras EXPIRED → nueva posición (max+1)", async () => {
      await prisma.waitlist.update({
        where: {
          eventId_personId: {
            eventId: ids.eventId,
            personId: ids.dancerId,
          },
        },
        data: { status: "EXPIRED" },
      });
      const res = await req(
        "POST",
        `/api/events/${ids.eventId}/waitlist`,
        {},
        dancerSession,
      );
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.status).toBe("WAITING");
      expect(body.position).toBe(3); // posiciones 1 y 2 existían
    });

    it("persona con ticket ACTIVE → 409", async () => {
      const ticket = await prisma.ticket.create({
        data: {
          eventId: ids.eventId,
          ownerId: ids.dancer3Id,
          buyerId: ids.dancer3Id,
          listPrice: 5000,
          serviceFee: 500,
        },
      });
      ids.ticketId = ticket.id;
      const res = await req(
        "POST",
        `/api/events/${ids.eventId}/waitlist`,
        {},
        dancer3Session,
      );
      expect(res.status).toBe(409);
    });
  });

  // ═══════════════════════ PRACTICES ═══════════════════════
  describe("POST /api/practices", () => {
    const future = (h: number) =>
      new Date(Date.now() + h * 3600 * 1000).toISOString();

    it("sin sesión → 401", async () => {
      const res = await req("POST", "/api/practices", {
        name: "x",
        venueId: ids.venueId,
        startsAt: future(48),
        endsAt: future(50),
      });
      expect(res.status).toBe(401);
    });

    it("endsAt <= startsAt → 400", async () => {
      const res = await req(
        "POST",
        "/api/practices",
        {
          name: "Práctica mala",
          venueId: ids.venueId,
          startsAt: future(50),
          endsAt: future(48),
        },
        dancerSession,
      );
      expect(res.status).toBe(400);
    });

    it("sin venueId → 400 (schema exige Event.venueId)", async () => {
      const res = await req(
        "POST",
        "/api/practices",
        { name: "Práctica sin venue", startsAt: future(48), endsAt: future(50) },
        dancerSession,
      );
      expect(res.status).toBe(400);
    });

    it("venue inexistente → 404", async () => {
      const res = await req(
        "POST",
        "/api/practices",
        {
          name: "Práctica venue fantasma",
          venueId: "venue-fantasma",
          startsAt: future(48),
          endsAt: future(50),
        },
        dancerSession,
      );
      expect(res.status).toBe(404);
    });

    it("capacity 0 → 400", async () => {
      const res = await req(
        "POST",
        "/api/practices",
        {
          name: "Práctica cap 0",
          venueId: ids.venueId,
          startsAt: future(48),
          endsAt: future(50),
          capacity: 0,
        },
        dancerSession,
      );
      expect(res.status).toBe(400);
    });

    it("style inexistente → 400", async () => {
      const res = await req(
        "POST",
        "/api/practices",
        {
          name: "Práctica style fantasma",
          venueId: ids.venueId,
          startsAt: future(48),
          endsAt: future(50),
          style: "estilo-que-no-existe",
        },
        dancerSession,
      );
      expect(res.status).toBe(400);
    });

    it("válida → 201, Event PRACTICA/PUBLISHED, hostId=creador, host con RSVP GOING y ScheduleBlock del estilo", async () => {
      const res = await req(
        "POST",
        "/api/practices",
        {
          name: "Práctica de casino en el parque",
          venueId: ids.venueId,
          startsAt: future(48),
          endsAt: future(50),
          capacity: 12,
          style: ids.styleId,
        },
        dancerSession,
      );
      expect(res.status).toBe(201);
      const event = await res.json();
      ids.practiceEventIds.push(event.id);
      expect(event.type).toBe("PRACTICA");
      expect(event.status).toBe("PUBLISHED");
      expect(event.hostId).toBe(ids.dancerId);
      expect(event.venueId).toBe(ids.venueId);
      expect(event.capacity).toBe(12);

      const rsvp = await prisma.rsvp.findUnique({
        where: {
          eventId_personId: { eventId: event.id, personId: ids.dancerId },
        },
      });
      expect(rsvp?.status).toBe("GOING");

      const block = await prisma.scheduleBlock.findFirst({
        where: { eventId: event.id },
      });
      expect(block?.styleId).toBe(ids.styleId);
    });
  });

  describe("GET /api/practices", () => {
    it("lista públicamente solo PRACTICA publicadas próximas", async () => {
      const res = await fetch(`${baseUrl}/api/practices`);
      expect(res.status).toBe(200);
      const list = await res.json();
      expect(Array.isArray(list)).toBe(true);
      const mine = list.find(
        (e: { id: string }) => e.id === ids.practiceEventIds[0],
      );
      expect(mine).toBeTruthy();
      expect(mine.type).toBe("PRACTICA");
      expect(mine.hostId).toBe(ids.dancerId);
      expect(mine.venue.name).toBe("Venue Social Test");
      // ningún evento que no sea práctica se cuela
      expect(
        list.every((e: { type: string }) => e.type === "PRACTICA"),
      ).toBe(true);
    });
  });

  // ═══════════════════════ TRIPS ═══════════════════════
  describe("POST /api/trips", () => {
    const future = (h: number) =>
      new Date(Date.now() + h * 3600 * 1000).toISOString();

    it("sin sesión → 401", async () => {
      const res = await req("POST", "/api/trips", {
        city: "Valparaíso",
        startsAt: future(200),
        endsAt: future(250),
      });
      expect(res.status).toBe(401);
    });

    it("rango inválido → 400", async () => {
      const res = await req(
        "POST",
        "/api/trips",
        { city: "Valparaíso", startsAt: future(250), endsAt: future(200) },
        dancerSession,
      );
      expect(res.status).toBe(400);
    });

    it("eventId fantasma → 400", async () => {
      const res = await req(
        "POST",
        "/api/trips",
        {
          city: "Buenos Aires",
          startsAt: future(200),
          endsAt: future(250),
          eventId: "evt-fantasma",
        },
        dancerSession,
      );
      expect(res.status).toBe(400);
    });

    it("válido → 201 con destination=city", async () => {
      const res = await req(
        "POST",
        "/api/trips",
        {
          city: "Valparaíso",
          startsAt: future(200),
          endsAt: future(250),
          eventId: ids.eventId,
        },
        dancerSession,
      );
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.destination).toBe("Valparaíso");
      expect(body.personId).toBe(ids.dancerId);
      expect(body.eventId).toBe(ids.eventId);
    });
  });

  describe("GET /api/trips/mine", () => {
    it("sin sesión → 401", async () => {
      const res = await fetch(`${baseUrl}/api/trips/mine`);
      expect(res.status).toBe(401);
    });

    it("devuelve solo los trips propios", async () => {
      const res = await fetch(`${baseUrl}/api/trips/mine`, {
        headers: { cookie: `omnidance_session=${dancerSession}` },
      });
      expect(res.status).toBe(200);
      const trips = await res.json();
      expect(trips.length).toBeGreaterThanOrEqual(1);
      expect(
        trips.every(
          (t: { personId: string }) => t.personId === ids.dancerId,
        ),
      ).toBe(true);
      expect(trips[0].destination).toBe("Valparaíso");
    });
  });
});
