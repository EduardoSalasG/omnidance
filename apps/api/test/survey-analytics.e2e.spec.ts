import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Test } from "@nestjs/testing";
import { ValidationPipe, type INestApplication } from "@nestjs/common";
import { AuthModule } from "../src/auth/auth.module";
import { AuthService } from "../src/auth/domain/auth.service";
import { NotificationsModule } from "../src/notifications/notifications.module";
import { PrismaService } from "../src/prisma.service";
import { PeopleController } from "../src/people/people.controller";
import { EventRatingsController } from "../src/events/infrastructure/event-ratings.controller";
import { EventAnalyticsController } from "../src/events/infrastructure/event-analytics.controller";

// dancer-profile-survey-analytics (slice API): gender en PATCH/GET /me,
// overall en POST ratings, GET /me/pending-surveys con fan-out lazy
// deduplicado por surveyNotifiedAt, y GET /events/:id/analytics
// (owner/admin + k-anonymity). Controllers montados directos en el
// test module (mismo patrón que gap-events) contra la DB real.

describe("dancer-profile-survey-analytics e2e", () => {
  let app: INestApplication;
  let baseUrl: string;
  let prisma: PrismaService;
  const auth = new AuthService(process.env.JWT_SECRET ?? "dev-secret-change-me");

  const suffix = Date.now().toString(36);

  const sessions: Record<string, string> = {};
  const ids = {
    producerId: "",
    strangerId: "",
    aId: "",
    bId: "",
    cId: "",
    dId: "",
    surveyEventId: "", // terminó hace 2h — ventana abierta
    smallEventId: "", // terminó hace 3h — solo 2 asistentes
    salsaStyleId: "",
    bachataStyleId: "",
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

  const mkPerson = async (
    name: string,
    role = "DANCER",
    gender?: "M" | "F" | "OTHER",
  ) => {
    const p = await prisma.person.create({
      data: {
        name: `${name} ${suffix}`,
        ...(gender ? { gender } : {}),
        roles: { create: [{ role, status: "APPROVED" }] },
      },
    });
    return { id: p.id, session: await auth.issueSession(p.id) };
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AuthModule, NotificationsModule],
      controllers: [
        PeopleController,
        EventRatingsController,
        EventAnalyticsController,
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

    const salsa = await prisma.style.findFirstOrThrow({
      where: { genre: "SALSA" },
    });
    const bachata = await prisma.style.findFirstOrThrow({
      where: { genre: "BACHATA" },
    });
    ids.salsaStyleId = salsa.id;
    ids.bachataStyleId = bachata.id;

    const [producer, stranger, a, b, c, d] = await Promise.all([
      mkPerson("SA Productor", "PRODUCER"),
      mkPerson("SA Stranger"),
      mkPerson("SA Bailarin A", "DANCER", "M"),
      mkPerson("SA Bailarin B", "DANCER", "F"),
      mkPerson("SA Bailarin C", "DANCER", "F"),
      mkPerson("SA Bailarin D", "DANCER"), // sin género → unknown
    ]);
    ids.producerId = producer.id;
    sessions.producer = producer.session;
    ids.strangerId = stranger.id;
    sessions.stranger = stranger.session;
    ids.aId = a.id;
    sessions.a = a.session;
    ids.bId = b.id;
    sessions.b = b.session;
    ids.cId = c.id;
    sessions.c = c.session;
    ids.dId = d.id;
    sessions.d = d.session;

    const venue = await prisma.venue.create({ data: { name: `SA Venue ${suffix}` } });
    const base = { venueId: venue.id, producerId: producer.id };
    const [surveyEvent, smallEvent] = await Promise.all([
      prisma.event.create({
        data: {
          ...base,
          name: `SA Social ${suffix}`,
          status: "PUBLISHED",
          genres: ["SALSA"],
          startsAt: new Date(Date.now() - 6 * 3600 * 1000),
          endsAt: new Date(Date.now() - 2 * 3600 * 1000),
        },
      }),
      prisma.event.create({
        data: {
          ...base,
          name: `SA Chico ${suffix}`,
          status: "PUBLISHED",
          startsAt: new Date(Date.now() - 5 * 3600 * 1000),
          endsAt: new Date(Date.now() - 3 * 3600 * 1000),
        },
      }),
    ]);
    ids.surveyEventId = surveyEvent.id;
    ids.smallEventId = smallEvent.id;

    // Asistencia: a/b/c/d al evento survey (d con check-in anulado extra),
    // a/b al evento chico. Roles de baile para el roleSplit.
    await prisma.checkin.createMany({
      data: [
        { eventId: surveyEvent.id, personId: a.id, method: "SCAN" },
        { eventId: surveyEvent.id, personId: b.id, method: "SCAN" },
        { eventId: surveyEvent.id, personId: c.id, method: "MANUAL" },
        { eventId: surveyEvent.id, personId: d.id, method: "SCAN" },
        {
          eventId: surveyEvent.id,
          personId: stranger.id,
          method: "SCAN",
          voidedAt: new Date(),
        },
        { eventId: smallEvent.id, personId: a.id, method: "SCAN" },
        { eventId: smallEvent.id, personId: b.id, method: "SCAN" },
      ],
    });
    await prisma.personStyleRole.createMany({
      data: [
        { personId: a.id, styleId: salsa.id, role: "LEADER" },
        { personId: b.id, styleId: salsa.id, role: "FOLLOWER" },
        { personId: c.id, styleId: salsa.id, role: "LEADER" },
        { personId: c.id, styleId: salsa.id, role: "FOLLOWER" }, // → both
        { personId: d.id, styleId: bachata.id, role: "SWITCH" }, // fuera de género
      ],
    });
  });

  afterAll(async () => {
    const personIds = [
      ids.producerId,
      ids.strangerId,
      ids.aId,
      ids.bId,
      ids.cId,
      ids.dId,
    ];
    await prisma.notification.deleteMany({
      where: { personId: { in: personIds } },
    });
    await prisma.eventRating.deleteMany({
      where: { eventId: { in: [ids.surveyEventId, ids.smallEventId] } },
    });
    await prisma.personStyleRole.deleteMany({
      where: { personId: { in: personIds } },
    });
    await prisma.checkin.deleteMany({
      where: { eventId: { in: [ids.surveyEventId, ids.smallEventId] } },
    });
    await prisma.event.deleteMany({
      where: { id: { in: [ids.surveyEventId, ids.smallEventId] } },
    });
    await prisma.venue.deleteMany({ where: { name: `SA Venue ${suffix}` } });
    await prisma.personRole.deleteMany({ where: { personId: { in: personIds } } });
    await prisma.person.deleteMany({ where: { id: { in: personIds } } });
    await app.close();
  });

  it("PATCH /me: gender válido persiste, inválido → 400, null limpia", async () => {
    let res = await req("PATCH", "/api/me", { gender: "F" }, sessions.a);
    expect(res.status).toBe(200);
    expect(
      (await prisma.person.findUniqueOrThrow({ where: { id: ids.aId } }))
        .gender,
    ).toBe("F");

    res = await req("PATCH", "/api/me", { gender: "X" }, sessions.a);
    expect(res.status).toBe(400);

    res = await req("PATCH", "/api/me", { gender: null }, sessions.a);
    expect(res.status).toBe(200);
    expect(
      (await prisma.person.findUniqueOrThrow({ where: { id: ids.aId } }))
        .gender,
    ).toBeNull();

    // Restaura el género del fixture — la analítica de abajo lo cuenta.
    res = await req("PATCH", "/api/me", { gender: "M" }, sessions.a);
    expect(res.status).toBe(200);
  });

  it("GET /me expone gender", async () => {
    await prisma.person.update({ where: { id: ids.bId }, data: { gender: "F" } });
    const res = await req("GET", "/api/me", undefined, sessions.b);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.gender).toBe("F");
  });

  it("POST ratings acepta overall (y valida rango)", async () => {
    let res = await req(
      "POST",
      `/api/events/${ids.surveyEventId}/ratings`,
      { overall: 5, music: 4 },
      sessions.a,
    );
    expect(res.status).toBe(200);
    const rating = await prisma.eventRating.findUniqueOrThrow({
      where: {
        eventId_raterId: { eventId: ids.surveyEventId, raterId: ids.aId },
      },
    });
    expect(rating.overall).toBe(5);

    res = await req(
      "POST",
      `/api/events/${ids.surveyEventId}/ratings`,
      { overall: 7 },
      sessions.a,
    );
    expect(res.status).toBe(400);
  });

  it("GET /me/pending-surveys: elegible + fan-out único a todos los asistentes", async () => {
    // "a" ya evaluó el evento survey → su lista lo excluye (smallEvent
    // sigue elegible para "a" — es válido).
    const resA = await req(
      "GET",
      "/api/me/pending-surveys",
      undefined,
      sessions.a,
    );
    expect(resA.status).toBe(200);
    const listA = (await resA.json()) as { eventId: string }[];
    expect(listA.map((e) => e.eventId)).not.toContain(ids.surveyEventId);

    const resB = await req(
      "GET",
      "/api/me/pending-surveys",
      undefined,
      sessions.b,
    );
    expect(resB.status).toBe(200);
    const pending = (await resB.json()) as { eventId: string }[];
    expect(pending.map((e) => e.eventId)).toContain(ids.surveyEventId);

    // Fan-out lazy: alguno de los requests ganadores reclamó el evento y
    // notificó a TODOS los asistentes no-anulados (a, b, c, d) — el
    // stranger con check-in anulado no entra.
    const surveyNotifs = await prisma.notification
      .findMany({ where: { type: "event.survey" } })
      .then((rows) =>
        rows.filter(
          (n) =>
            (n.data as { eventId?: string } | null)?.eventId ===
            ids.surveyEventId,
        ),
      );
    expect(new Set(surveyNotifs.map((n) => n.personId))).toEqual(
      new Set([ids.aId, ids.bId, ids.cId, ids.dId]),
    );
    const event = await prisma.event.findUniqueOrThrow({
      where: { id: ids.surveyEventId },
    });
    expect(event.surveyNotifiedAt).not.toBeNull();

    // Otro request (asistente c) → sigue elegible pero sin re-fanout.
    const resC = await req(
      "GET",
      "/api/me/pending-surveys",
      undefined,
      sessions.c,
    );
    expect(resC.status).toBe(200);
    const surveyNotifsAfter = await prisma.notification
      .findMany({ where: { type: "event.survey" } })
      .then((rows) =>
        rows.filter(
          (n) =>
            (n.data as { eventId?: string } | null)?.eventId ===
            ids.surveyEventId,
        ),
      );
    expect(surveyNotifsAfter.length).toBe(surveyNotifs.length);
  });

  it("GET /events/:id/analytics: 404 inexistente, 403 no-owner, null bajo umbral", async () => {
    let res = await req(
      "GET",
      "/api/events/nope/analytics",
      undefined,
      sessions.producer,
    );
    expect(res.status).toBe(404);

    res = await req(
      "GET",
      `/api/events/${ids.surveyEventId}/analytics`,
      undefined,
      sessions.stranger,
    );
    expect(res.status).toBe(403);

    // smallEvent: 2 asistentes → splits y ratings ocultos (k-anonymity)
    res = await req(
      "GET",
      `/api/events/${ids.smallEventId}/analytics`,
      undefined,
      sessions.producer,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      attendees: 2,
      genderSplit: null,
      roleSplit: null,
      ratings: null,
    });
  });

  it("GET /events/:id/analytics: shape completo con ≥3 asistentes", async () => {
    const res = await req(
      "GET",
      `/api/events/${ids.surveyEventId}/analytics`,
      undefined,
      sessions.producer,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.attendees).toBe(4); // stranger anulado no cuenta
    expect(body.genderSplit).toEqual({ M: 1, F: 2, OTHER: 0, unknown: 1 });
    // a=leader(salsa), b=follower(salsa), c=leader+follower→both,
    // d=SWITCH en bachata (género fuera del evento) → no cuenta.
    expect(body.roleSplit).toEqual({ leader: 1, follower: 1, both: 1 });
    expect(body.ratings.count).toBe(1);
    // k-anonymity por dim: <3 valores → promedio oculto (expondría la
    // evaluación individual de esa persona)
    expect(body.ratings.byDim.overall).toBeNull();
    expect(body.ratings.byDim.music).toBeNull();
    expect(body.ratings.byDim.temperature).toBeNull();
  });
});
