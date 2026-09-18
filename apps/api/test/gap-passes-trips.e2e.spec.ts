import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Test } from "@nestjs/testing";
import { ValidationPipe, type INestApplication } from "@nestjs/common";
import { AuthModule } from "../src/auth/auth.module";
import { AuthService } from "../src/auth/domain/auth.service";
import { SocialModule } from "../src/social/social.module";
import { PrismaService } from "../src/prisma.service";
// Controller nuevo aún no registrado en SocialModule (wiring del padre
// pendiente): se monta directo en el test module para cubrir el contrato.
import { EventEntryPassesController } from "../src/social/infrastructure/entry-passes.controller";

const phone = () =>
  `010${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;

describe("gap-passes-trips e2e (list pass / event passes / trip matches)", () => {
  let app: INestApplication;
  let baseUrl: string;
  let prisma: PrismaService;
  const auth = new AuthService(
    process.env.JWT_SECRET ?? "dev-secret-change-me",
  );

  let ownerSession: string;
  let staffSession: string;
  let producerSession: string;
  let assignedSession: string;
  let randomSession: string;
  let travelerSession: string;

  const ids = {
    venueId: "",
    eventId: "",
    listId: "",
    otherListId: "",
    entryGuest1Id: "",
    entryGuest2Id: "",
    entryOtherListId: "",
    producerId: "",
    ownerId: "",
    staffId: "",
    assignedId: "",
    randomId: "",
    guest1Id: "",
    guest2Id: "",
    travelerId: "",
    matchAId: "",
    matchBId: "",
    matchCId: "",
    tripOwnId: "",
    tripAId: "",
    tripBId: "",
    tripCId: "",
  };

  // Ventana de matching: el caller viaja 2026-03-08 → 2026-03-21.
  const T = (iso: string) => new Date(iso);
  let destTag = "";

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

  const allPeople = () => [
    ids.producerId,
    ids.ownerId,
    ids.staffId,
    ids.assignedId,
    ids.randomId,
    ids.guest1Id,
    ids.guest2Id,
    ids.travelerId,
    ids.matchAId,
    ids.matchBId,
    ids.matchCId,
  ];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [SocialModule, AuthModule],
      controllers: [EventEntryPassesController],
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
    destTag = `Congreso-GapPT-${suffix}`;

    const venue = await prisma.venue.create({
      data: { name: `Venue GapPT ${suffix}` },
    });
    ids.venueId = venue.id;

    const mkPerson = (
      name: string,
      tag: string,
      roles: string[] = ["DANCER"],
      extra: Record<string, unknown> = {},
    ) =>
      prisma.person.create({
        data: {
          name,
          email: `gap-pt-${tag}-${suffix}@test.cl`,
          ...extra,
          roles: { create: roles.map((role) => ({ role, status: "APPROVED" })) },
        },
      });

    const [
      producer,
      owner,
      staff,
      assigned,
      random,
      guest1,
      guest2,
      traveler,
      matchA,
      matchB,
      matchC,
    ] = await Promise.all([
      mkPerson("PT Producer", "producer", ["PRODUCER"]),
      mkPerson("PT List Owner", "owner"),
      mkPerson("PT Staff", "staff", ["STAFF"]),
      mkPerson("PT Assigned", "assigned"),
      mkPerson("PT Random", "random"),
      mkPerson("PT Guest Uno", "guest1", ["DANCER"], { phone: phone() }),
      mkPerson("PT Guest Dos", "guest2"),
      mkPerson("PT Traveler", "traveler"),
      mkPerson("PT Match A", "matcha"),
      mkPerson("PT Match B", "matchb"),
      mkPerson("PT Match C", "matchc"),
    ]);
    ids.producerId = producer.id;
    ids.ownerId = owner.id;
    ids.staffId = staff.id;
    ids.assignedId = assigned.id;
    ids.randomId = random.id;
    ids.guest1Id = guest1.id;
    ids.guest2Id = guest2.id;
    ids.travelerId = traveler.id;
    ids.matchAId = matchA.id;
    ids.matchBId = matchB.id;
    ids.matchCId = matchC.id;

    [ownerSession, staffSession, producerSession, assignedSession,
      randomSession, travelerSession] = await Promise.all([
      auth.issueSession(owner.id),
      auth.issueSession(staff.id),
      auth.issueSession(producer.id),
      auth.issueSession(assigned.id),
      auth.issueSession(random.id),
      auth.issueSession(traveler.id),
    ]);

    const event = await prisma.event.create({
      data: {
        venueId: venue.id,
        producerId: producer.id,
        name: `Evento GapPT ${suffix}`,
        status: "PUBLISHED",
        startsAt: T("2026-03-14T20:00:00Z"),
        endsAt: T("2026-03-15T04:00:00Z"),
      },
    });
    ids.eventId = event.id;

    await prisma.staffAssignment.create({
      data: { eventId: event.id, personId: assigned.id, role: "DOOR" },
    });

    const list = await prisma.guestList.create({
      data: {
        eventId: event.id,
        ownerId: owner.id,
        label: `Lista GapPT ${suffix}`,
        specialPrice: 3000,
      },
    });
    ids.listId = list.id;
    const e1 = await prisma.guestListEntry.create({
      data: { guestListId: list.id, personId: guest1.id },
    });
    ids.entryGuest1Id = e1.id;
    const e2 = await prisma.guestListEntry.create({
      data: { guestListId: list.id, personId: guest2.id },
    });
    ids.entryGuest2Id = e2.id;

    // Segunda lista para el caso "entry de otra lista → 404"
    const otherList = await prisma.guestList.create({
      data: { eventId: event.id, ownerId: owner.id },
    });
    ids.otherListId = otherList.id;
    const eOther = await prisma.guestListEntry.create({
      data: { guestListId: otherList.id, personId: random.id },
    });
    ids.entryOtherListId = eOther.id;

    // ─── trips ───
    const trip = (
      personId: string,
      destination: string,
      startsAt: Date,
      endsAt: Date,
      eventId?: string,
    ) =>
      prisma.trip.create({
        data: { personId, destination, startsAt, endsAt, eventId: eventId ?? null },
      });

    // Viaje propio del caller — nunca debe aparecer en sus matches.
    const tOwn = await trip(
      traveler.id,
      `${destTag} propio`,
      T("2026-03-08T00:00:00Z"),
      T("2026-03-21T00:00:00Z"),
    );
    ids.tripOwnId = tOwn.id;
    // Match A: solapa la ventana del caller.
    const tA = await trip(
      matchA.id,
      `viaje al ${destTag} edición 5`,
      T("2026-03-12T00:00:00Z"),
      T("2026-03-18T00:00:00Z"),
    );
    ids.tripAId = tA.id;
    // Match B: mismo destino pero fuera de la ventana.
    const tB = await trip(
      matchB.id,
      `${destTag} vol.2`,
      T("2026-03-25T00:00:00Z"),
      T("2026-04-01T00:00:00Z"),
    );
    ids.tripBId = tB.id;
    // Match C: otro destino, mismo evento.
    const tC = await trip(
      matchC.id,
      `Otra ciudad ${suffix}`,
      T("2026-03-13T00:00:00Z"),
      T("2026-03-15T00:00:00Z"),
      event.id,
    );
    ids.tripCId = tC.id;
  });

  afterAll(async () => {
    const people = allPeople();
    await prisma.entryPass.deleteMany({ where: { eventId: ids.eventId } });
    await prisma.guestListEntry.deleteMany({
      where: { guestListId: { in: [ids.listId, ids.otherListId] } },
    });
    await prisma.guestList.deleteMany({
      where: { id: { in: [ids.listId, ids.otherListId] } },
    });
    await prisma.trip.deleteMany({ where: { personId: { in: people } } });
    await prisma.staffAssignment.deleteMany({
      where: { eventId: ids.eventId },
    });
    await prisma.notification.deleteMany({
      where: { personId: { in: people } },
    });
    await prisma.personRole.deleteMany({
      where: { personId: { in: people } },
    });
    await prisma.event.delete({ where: { id: ids.eventId } });
    await prisma.venue.delete({ where: { id: ids.venueId } });
    await prisma.person.deleteMany({ where: { id: { in: people } } });
    await app.close();
  });

  // ═══════════ POST /api/guest-lists/:listId/entries/:entryId/pass ═══════════
  describe("POST /api/guest-lists/:listId/entries/:entryId/pass", () => {
    it("sin sesión → 401", async () => {
      const res = await req(
        "POST",
        `/api/guest-lists/${ids.listId}/entries/${ids.entryGuest1Id}/pass`,
        {},
      );
      expect(res.status).toBe(401);
    });

    it("lista inexistente → 404", async () => {
      const res = await req(
        "POST",
        `/api/guest-lists/gl-fantasma/entries/${ids.entryGuest1Id}/pass`,
        {},
        ownerSession,
      );
      expect(res.status).toBe(404);
    });

    it("entry de otra lista → 404", async () => {
      const res = await req(
        "POST",
        `/api/guest-lists/${ids.listId}/entries/${ids.entryOtherListId}/pass`,
        {},
        ownerSession,
      );
      expect(res.status).toBe(404);
    });

    it("persona sin relación → 403", async () => {
      const res = await req(
        "POST",
        `/api/guest-lists/${ids.listId}/entries/${ids.entryGuest1Id}/pass`,
        {},
        randomSession,
      );
      expect(res.status).toBe(403);
    });

    it("dueño de la lista emite pase LIST con specialPrice → 201 ACTIVE", async () => {
      const res = await req(
        "POST",
        `/api/guest-lists/${ids.listId}/entries/${ids.entryGuest1Id}/pass`,
        {},
        ownerSession,
      );
      expect(res.status).toBe(201);
      const pass = await res.json();
      expect(pass).toMatchObject({
        eventId: ids.eventId,
        personId: ids.guest1Id,
        type: "LIST",
        price: 3000,
        status: "ACTIVE",
      });

      // El pase no implica llegada: la entry sigue PENDING.
      const entry = await prisma.guestListEntry.findUniqueOrThrow({
        where: { id: ids.entryGuest1Id },
      });
      expect(entry.status).toBe("PENDING");
    });

    it("idempotente: re-emitir retorna el mismo pase sin duplicar", async () => {
      const res = await req(
        "POST",
        `/api/guest-lists/${ids.listId}/entries/${ids.entryGuest1Id}/pass`,
        {},
        ownerSession,
      );
      expect(res.status).toBe(200);
      const pass = await res.json();

      const count = await prisma.entryPass.count({
        where: { eventId: ids.eventId, personId: ids.guest1Id, type: "LIST" },
      });
      expect(count).toBe(1);
      const saved = await prisma.entryPass.findFirstOrThrow({
        where: { eventId: ids.eventId, personId: ids.guest1Id, type: "LIST" },
      });
      expect(pass.id).toBe(saved.id);
    });

    it("staff con social.manage emite pase para otra entry → 201", async () => {
      const res = await req(
        "POST",
        `/api/guest-lists/${ids.listId}/entries/${ids.entryGuest2Id}/pass`,
        {},
        staffSession,
      );
      expect(res.status).toBe(201);
      const pass = await res.json();
      expect(pass.personId).toBe(ids.guest2Id);
      expect(pass.type).toBe("LIST");
    });

    it("producer del evento también está autorizado (replay → 200)", async () => {
      const res = await req(
        "POST",
        `/api/guest-lists/${ids.listId}/entries/${ids.entryGuest1Id}/pass`,
        {},
        producerSession,
      );
      expect(res.status).toBe(200);
    });
  });

  // ═══════════════ GET /api/events/:id/passes ═══════════════
  describe("GET /api/events/:id/passes", () => {
    it("sin sesión → 401", async () => {
      const res = await req("GET", `/api/events/${ids.eventId}/passes`);
      expect(res.status).toBe(401);
    });

    it("evento inexistente → 404", async () => {
      const res = await req(
        "GET",
        "/api/events/evt-fantasma/passes",
        undefined,
        producerSession,
      );
      expect(res.status).toBe(404);
    });

    it("persona sin relación → 403", async () => {
      const res = await req(
        "GET",
        `/api/events/${ids.eventId}/passes`,
        undefined,
        randomSession,
      );
      expect(res.status).toBe(403);
    });

    it("producer lista los pases con person {id,name,phone}", async () => {
      const res = await req(
        "GET",
        `/api/events/${ids.eventId}/passes`,
        undefined,
        producerSession,
      );
      expect(res.status).toBe(200);
      const list = await res.json();
      const mine = list.filter((p: { personId: string }) =>
        [ids.guest1Id, ids.guest2Id].includes(p.personId),
      );
      expect(mine).toHaveLength(2);
      for (const p of mine) {
        expect(p.type).toBe("LIST");
        expect(p.person).toMatchObject({ id: p.personId });
        expect(p.person).toHaveProperty("name");
        expect(p.person).toHaveProperty("phone");
      }
      const g1 = mine.find(
        (p: { personId: string }) => p.personId === ids.guest1Id,
      );
      expect(g1.person.name).toBe("PT Guest Uno");
      expect(g1.person.phone).toBeTruthy();

      // desc por createdAt
      const createdAts = list.map((p: { createdAt: string }) =>
        new Date(p.createdAt).getTime(),
      );
      expect([...createdAts].sort((a, b) => b - a)).toEqual(createdAts);
    });

    it("staff asignado al evento (sin grant global) → 200", async () => {
      const res = await req(
        "GET",
        `/api/events/${ids.eventId}/passes`,
        undefined,
        assignedSession,
      );
      expect(res.status).toBe(200);
    });
  });

  // ═══════════════ GET /api/trips/matches ═══════════════
  describe("GET /api/trips/matches", () => {
    it("sin sesión → 401", async () => {
      const res = await req("GET", "/api/trips/matches?destination=x");
      expect(res.status).toBe(401);
    });

    it("sin destination ni eventId → 400", async () => {
      const res = await req(
        "GET",
        "/api/trips/matches",
        undefined,
        travelerSession,
      );
      expect(res.status).toBe(400);
    });

    it("por destination (case-insensitive contains): matchA+matchB, excluye al caller", async () => {
      const res = await req(
        "GET",
        `/api/trips/matches?destination=${encodeURIComponent(destTag.toLowerCase())}`,
        undefined,
        travelerSession,
      );
      expect(res.status).toBe(200);
      const matches = await res.json();
      const matchIds = matches.map((m: { id: string }) => m.id);

      expect(matchIds).toContain(ids.tripAId);
      expect(matchIds).toContain(ids.tripBId);
      expect(matchIds).not.toContain(ids.tripOwnId);

      const a = matches.find((m: { id: string }) => m.id === ids.tripAId);
      expect(a).toMatchObject({
        eventId: null,
        person: { id: ids.matchAId, name: "PT Match A" },
      });
      expect(a.person).toHaveProperty("photoUrl");
      expect(a).toHaveProperty("startsAt");
      expect(a).toHaveProperty("endsAt");
    });

    it("con from/to solo devuelve trips que solapan la ventana", async () => {
      const res = await req(
        "GET",
        `/api/trips/matches?destination=${encodeURIComponent(destTag)}&from=2026-03-08&to=2026-03-21`,
        undefined,
        travelerSession,
      );
      expect(res.status).toBe(200);
      const matches = await res.json();
      const matchIds = matches.map((m: { id: string }) => m.id);
      expect(matchIds).toContain(ids.tripAId);
      expect(matchIds).not.toContain(ids.tripBId);
      expect(matchIds).not.toContain(ids.tripOwnId);
    });

    it("por eventId devuelve el trip asociado al evento", async () => {
      const res = await req(
        "GET",
        `/api/trips/matches?eventId=${ids.eventId}`,
        undefined,
        travelerSession,
      );
      expect(res.status).toBe(200);
      const matches = await res.json();
      const matchIds = matches.map((m: { id: string }) => m.id);
      expect(matchIds).toContain(ids.tripCId);
      expect(matchIds).not.toContain(ids.tripAId);
      const c = matches.find((m: { id: string }) => m.id === ids.tripCId);
      expect(c.eventId).toBe(ids.eventId);
      expect(c.person.id).toBe(ids.matchCId);
    });
  });
});
