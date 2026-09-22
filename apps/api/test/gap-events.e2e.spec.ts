import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Test } from "@nestjs/testing";
import { ValidationPipe, type INestApplication } from "@nestjs/common";
import { AuthModule } from "../src/auth/auth.module";
import { AuthService } from "../src/auth/domain/auth.service";
import { PaymentsModule } from "../src/payments/payments.module";
import { PrismaService } from "../src/prisma.service";
// Controllers nuevos aún no registrados en EventsModule (wiring pendiente):
// se montan directo en el test module para cubrir el contrato HTTP.
import { EventRatingsController } from "../src/events/infrastructure/event-ratings.controller";
import { TableReservationsController } from "../src/events/infrastructure/table-reservations.controller";
import { SongSuggestionsController } from "../src/events/infrastructure/song-suggestions.controller";

describe("spec-gap-closure: events (ratings + reservas + sugerencias) e2e", () => {
  let app: INestApplication;
  let baseUrl: string;
  let prisma: PrismaService;
  const auth = new AuthService(
    process.env.JWT_SECRET ?? "dev-secret-change-me",
  );

  const suffix = Date.now().toString(36);

  const sessions = {
    producer: "",
    dj: "",
    admin: "",
    a: "",
    b: "",
    c: "",
    d: "",
  };

  const ids = {
    producerId: "",
    djId: "",
    adminId: "",
    aId: "",
    bId: "",
    cId: "",
    dId: "",
    venueId: "",
    rateEventId: "", // PUBLISHED, terminó hace 2h (ventana abierta)
    closedEventId: "", // PUBLISHED, terminó hace 30h (ventana cerrada)
    lowEventId: "", // PUBLISHED, terminó hace 1h — solo 1 rating
    draftEventId: "", // DRAFT
    suggestEventId: "", // PUBLISHED con preventa + DJ asignado
    reservationId: "",
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

  const mkPerson = async (name: string, role = "DANCER") => {
    const p = await prisma.person.create({
      data: { name, roles: { create: [{ role, status: "APPROVED" }] } },
    });
    return { id: p.id, session: await auth.issueSession(p.id) };
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PaymentsModule, AuthModule],
      controllers: [
        EventRatingsController,
        TableReservationsController,
        SongSuggestionsController,
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

    // ─── personas ───
    const [prod, dj, admin, a, b, c, d] = await Promise.all([
      mkPerson(`GE Productor ${suffix}`, "PRODUCER"),
      mkPerson(`GE DJ ${suffix}`, "DJ"),
      mkPerson(`GE Admin ${suffix}`, "ADMIN"),
      mkPerson(`GE Bailarín A ${suffix}`),
      mkPerson(`GE Bailarín B ${suffix}`),
      mkPerson(`GE Bailarín C ${suffix}`),
      mkPerson(`GE Bailarín D ${suffix}`),
    ]);
    ids.producerId = prod.id;
    sessions.producer = prod.session;
    ids.djId = dj.id;
    sessions.dj = dj.session;
    ids.adminId = admin.id;
    sessions.admin = admin.session;
    ids.aId = a.id;
    sessions.a = a.session;
    ids.bId = b.id;
    sessions.b = b.session;
    ids.cId = c.id;
    sessions.c = c.session;
    ids.dId = d.id;
    sessions.d = d.session;

    // ─── venue + eventos ───
    const venue = await prisma.venue.create({
      data: { name: `GE Venue ${suffix}` },
    });
    ids.venueId = venue.id;

    const base = { venueId: venue.id, producerId: prod.id };
    const [rateEvent, closedEvent, lowEvent, draftEvent, suggestEvent] =
      await Promise.all([
        prisma.event.create({
          data: {
            ...base,
            name: `GE Rate ${suffix}`,
            status: "PUBLISHED",
            startsAt: new Date(Date.now() - 6 * 3600 * 1000),
            endsAt: new Date(Date.now() - 2 * 3600 * 1000),
          },
        }),
        prisma.event.create({
          data: {
            ...base,
            name: `GE Closed ${suffix}`,
            status: "PUBLISHED",
            startsAt: new Date(Date.now() - 36 * 3600 * 1000),
            endsAt: new Date(Date.now() - 30 * 3600 * 1000),
          },
        }),
        prisma.event.create({
          data: {
            ...base,
            name: `GE Low ${suffix}`,
            status: "PUBLISHED",
            startsAt: new Date(Date.now() - 5 * 3600 * 1000),
            endsAt: new Date(Date.now() - 1 * 3600 * 1000),
          },
        }),
        prisma.event.create({
          data: {
            ...base,
            name: `GE Draft ${suffix}`,
            status: "DRAFT",
            startsAt: new Date(Date.now() + 48 * 3600 * 1000),
            endsAt: new Date(Date.now() + 52 * 3600 * 1000),
          },
        }),
        prisma.event.create({
          data: {
            ...base,
            name: `GE Suggest ${suffix}`,
            status: "PUBLISHED",
            presalePrice: 8000,
            startsAt: new Date(Date.now() + 48 * 3600 * 1000),
            endsAt: new Date(Date.now() + 52 * 3600 * 1000),
          },
        }),
      ]);
    ids.rateEventId = rateEvent.id;
    ids.closedEventId = closedEvent.id;
    ids.lowEventId = lowEvent.id;
    ids.draftEventId = draftEvent.id;
    ids.suggestEventId = suggestEvent.id;

    // DJ asignado al evento de sugerencias
    await prisma.eventDj.create({
      data: { eventId: suggestEvent.id, personId: dj.id },
    });

    // Check-ins válidos: A/B/C en rateEvent; A en closedEvent y lowEvent.
    // D nunca entra → no puede evaluar.
    await prisma.checkin.createMany({
      data: [
        { eventId: rateEvent.id, personId: a.id },
        { eventId: rateEvent.id, personId: b.id },
        { eventId: rateEvent.id, personId: c.id },
        { eventId: closedEvent.id, personId: a.id },
        { eventId: lowEvent.id, personId: a.id },
      ],
    });
  });

  afterAll(async () => {
    const peopleIds = [
      ids.producerId,
      ids.djId,
      ids.adminId,
      ids.aId,
      ids.bId,
      ids.cId,
      ids.dId,
    ];
    const eventIds = [
      ids.rateEventId,
      ids.closedEventId,
      ids.lowEventId,
      ids.draftEventId,
      ids.suggestEventId,
    ];
    await prisma.eventRating.deleteMany({
      where: { eventId: { in: eventIds } },
    });
    await prisma.checkin.deleteMany({ where: { eventId: { in: eventIds } } });
    await prisma.tableReservation.deleteMany({
      where: { eventId: { in: eventIds } },
    });
    await prisma.songSuggestion.deleteMany({
      where: { eventId: { in: eventIds } },
    });
    await prisma.ticket.deleteMany({ where: { eventId: { in: eventIds } } });
    await prisma.payment.deleteMany({
      where: { personId: { in: peopleIds } },
    });
    await prisma.notification.deleteMany({
      where: { personId: { in: peopleIds } },
    });
    await prisma.eventDj.deleteMany({
      where: { eventId: { in: eventIds } },
    });
    await prisma.event.deleteMany({ where: { id: { in: eventIds } } });
    await prisma.venue.delete({ where: { id: ids.venueId } });
    await prisma.personRole.deleteMany({
      where: { personId: { in: peopleIds } },
    });
    await prisma.person.deleteMany({ where: { id: { in: peopleIds } } });
    await app.close();
  });

  // ═══════════════════════ EVENT RATINGS ═══════════════════════
  describe("POST /api/events/:id/ratings", () => {
    it("sin sesión → 401", async () => {
      const res = await req(
        "POST",
        `/api/events/${ids.rateEventId}/ratings`,
        { music: 5 },
      );
      expect(res.status).toBe(401);
    });

    it("evento inexistente → 404", async () => {
      const res = await req(
        "POST",
        "/api/events/evt-fantasma/ratings",
        { music: 5 },
        sessions.a,
      );
      expect(res.status).toBe(404);
    });

    it("dimensión fuera de rango → 400", async () => {
      const res = await req(
        "POST",
        `/api/events/${ids.rateEventId}/ratings`,
        { music: 9 },
        sessions.a,
      );
      expect(res.status).toBe(400);
    });

    it("sin check-in válido → 403", async () => {
      const res = await req(
        "POST",
        `/api/events/${ids.rateEventId}/ratings`,
        { music: 5 },
        sessions.d,
      );
      expect(res.status).toBe(403);
    });

    it("con check-in: crea la evaluación → 200", async () => {
      const res = await req(
        "POST",
        `/api/events/${ids.rateEventId}/ratings`,
        { music: 5, organization: 4 },
        sessions.a,
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.eventId).toBe(ids.rateEventId);
      expect(body.raterId).toBe(ids.aId);
      expect(body.music).toBe(5);
    });

    it("re-envío hace upsert por rater (edita sin duplicar ni pisar otras dims)", async () => {
      const res = await req(
        "POST",
        `/api/events/${ids.rateEventId}/ratings`,
        { music: 3, lightingSound: 5 },
        sessions.a,
      );
      expect(res.status).toBe(200);
      const rows = await prisma.eventRating.findMany({
        where: { eventId: ids.rateEventId, raterId: ids.aId },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0].music).toBe(3); // actualizado
      expect(rows[0].organization).toBe(4); // conservado
      expect(rows[0].lightingSound).toBe(5); // nuevo
    });

    it("B y C evalúan → quedan 3 evaluaciones (umbral)", async () => {
      const rb = await req(
        "POST",
        `/api/events/${ids.rateEventId}/ratings`,
        { music: 4, occupation: 5, floorComfort: 3 },
        sessions.b,
      );
      expect(rb.status).toBe(200);
      const rc = await req(
        "POST",
        `/api/events/${ids.rateEventId}/ratings`,
        { music: 2, temperature: 4 },
        sessions.c,
      );
      expect(rc.status).toBe(200);
      const count = await prisma.eventRating.count({
        where: { eventId: ids.rateEventId },
      });
      expect(count).toBe(3);
    });

    it("ventana cerrada (endsAt + 24h) → 409", async () => {
      const res = await req(
        "POST",
        `/api/events/${ids.closedEventId}/ratings`,
        { music: 5 },
        sessions.a,
      );
      expect(res.status).toBe(409);
    });
  });

  describe("GET /api/events/:id/ratings/summary", () => {
    it("sin sesión → 401", async () => {
      const res = await fetch(
        `${baseUrl}/api/events/${ids.rateEventId}/ratings/summary`,
      );
      expect(res.status).toBe(401);
    });

    it("asistente sin relación → 403", async () => {
      const res = await req(
        "GET",
        `/api/events/${ids.rateEventId}/ratings/summary`,
        undefined,
        sessions.a,
      );
      expect(res.status).toBe(403);
    });

    it("productor: promedios por actor, sin identidad del evaluador", async () => {
      const res = await req(
        "GET",
        `/api/events/${ids.rateEventId}/ratings/summary`,
        undefined,
        sessions.producer,
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.exposed).toBe(true);
      expect(body.count).toBe(3);
      // A=3, B=4, C=2 → avg 3
      expect(body.byActor.dj.music).toEqual({ avg: 3, count: 3 });
      expect(body.byActor.producer.occupation).toEqual({ avg: 5, count: 1 });
      expect(body.byActor.producer.organization).toEqual({ avg: 4, count: 1 });
      expect(body.byActor.venue.floorComfort).toEqual({ avg: 3, count: 1 });
      expect(body.byActor.venue.temperature).toEqual({ avg: 4, count: 1 });
      expect(body.byActor.venue.lightingSound).toEqual({ avg: 5, count: 1 });
      // nunca datos del evaluador
      expect(JSON.stringify(body)).not.toContain(ids.aId);
      expect(JSON.stringify(body)).not.toContain("raterId");
    });

    it("admin también puede ver el resumen", async () => {
      const res = await req(
        "GET",
        `/api/events/${ids.rateEventId}/ratings/summary`,
        undefined,
        sessions.admin,
      );
      expect(res.status).toBe(200);
      expect((await res.json()).exposed).toBe(true);
    });

    it("bajo el umbral (<3) → exposed:false sin promedios", async () => {
      await req(
        "POST",
        `/api/events/${ids.lowEventId}/ratings`,
        { music: 4 },
        sessions.a,
      );
      const res = await req(
        "GET",
        `/api/events/${ids.lowEventId}/ratings/summary`,
        undefined,
        sessions.producer,
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.exposed).toBe(false);
      expect(body.count).toBe(1);
      expect(body.byActor).toBeNull();
    });
  });

  // ═══════════════════════ TABLE RESERVATIONS ═══════════════════════
  describe("POST /api/events/:id/table-reservations", () => {
    it("sin sesión → 401", async () => {
      const res = await req(
        "POST",
        `/api/events/${ids.rateEventId}/table-reservations`,
        { partySize: 4 },
      );
      expect(res.status).toBe(401);
    });

    it("evento inexistente → 404", async () => {
      const res = await req(
        "POST",
        "/api/events/evt-fantasma/table-reservations",
        { partySize: 4 },
        sessions.a,
      );
      expect(res.status).toBe(404);
    });

    it("evento DRAFT → 409", async () => {
      const res = await req(
        "POST",
        `/api/events/${ids.draftEventId}/table-reservations`,
        { partySize: 4 },
        sessions.a,
      );
      expect(res.status).toBe(409);
    });

    it("partySize inválido → 400", async () => {
      const res = await req(
        "POST",
        `/api/events/${ids.rateEventId}/table-reservations`,
        { partySize: 0 },
        sessions.a,
      );
      expect(res.status).toBe(400);
    });

    it("crea reserva REQUESTED ligada a la cuenta", async () => {
      const res = await req(
        "POST",
        `/api/events/${ids.rateEventId}/table-reservations`,
        { partySize: 4 },
        sessions.a,
      );
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.status).toBe("REQUESTED");
      expect(body.personId).toBe(ids.aId);
      expect(body.partySize).toBe(4);
      ids.reservationId = body.id;
    });

    it("segunda reserva activa en el mismo evento → 409", async () => {
      const res = await req(
        "POST",
        `/api/events/${ids.rateEventId}/table-reservations`,
        { partySize: 2 },
        sessions.a,
      );
      expect(res.status).toBe(409);
    });
  });

  describe("gestión y visibilidad de reservas", () => {
    it("listado del evento: sin CONFIRMED todavía → []", async () => {
      const res = await req(
        "GET",
        `/api/events/${ids.rateEventId}/table-reservations`,
        undefined,
        sessions.b,
      );
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual([]);
    });

    it("PATCH sin sesión → 401", async () => {
      const res = await req(
        "PATCH",
        `/api/table-reservations/${ids.reservationId}`,
        { status: "CONFIRMED" },
      );
      expect(res.status).toBe(401);
    });

    it("bailarín ajeno intenta confirmar → 403", async () => {
      const res = await req(
        "PATCH",
        `/api/table-reservations/${ids.reservationId}`,
        { status: "CONFIRMED" },
        sessions.b,
      );
      expect(res.status).toBe(403);
    });

    it("status inválido → 400", async () => {
      const res = await req(
        "PATCH",
        `/api/table-reservations/${ids.reservationId}`,
        { status: "REQUESTED" },
        sessions.producer,
      );
      expect(res.status).toBe(400);
    });

    it("productor confirma con tableNo + ajusta partySize → 200", async () => {
      const res = await req(
        "PATCH",
        `/api/table-reservations/${ids.reservationId}`,
        { status: "CONFIRMED", tableNo: "M-7", partySize: 5 },
        sessions.producer,
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("CONFIRMED");
      expect(body.tableNo).toBe("M-7");
      // el tamaño solicitado era 4 — el productor lo ajusta (disclaimer del checkout)
      expect(body.partySize).toBe(5);
    });

    it("listado público-auth: solo CONFIRMED con nombre + partySize + tableNo", async () => {
      const res = await req(
        "GET",
        `/api/events/${ids.rateEventId}/table-reservations`,
        undefined,
        sessions.b,
      );
      expect(res.status).toBe(200);
      const list = await res.json();
      expect(list).toHaveLength(1);
      expect(list[0].person.name).toContain("GE Bailarín A");
      expect(list[0].partySize).toBe(5); // ajustado por el productor
      expect(list[0].tableNo).toBe("M-7");
      // sin datos sensibles del solicitante
      expect(list[0].person).not.toHaveProperty("id");
      expect(list[0]).not.toHaveProperty("personId");
    });

    it("listado sin sesión → 401", async () => {
      const res = await fetch(
        `${baseUrl}/api/events/${ids.rateEventId}/table-reservations`,
      );
      expect(res.status).toBe(401);
    });

    it("GET /table-reservations/mine devuelve las del usuario con su evento", async () => {
      const res = await req(
        "GET",
        "/api/table-reservations/mine",
        undefined,
        sessions.a,
      );
      expect(res.status).toBe(200);
      const mine = await res.json();
      const r = mine.find((x: { id: string }) => x.id === ids.reservationId);
      expect(r).toBeTruthy();
      expect(r.status).toBe("CONFIRMED");
      expect(r.event.id).toBe(ids.rateEventId);
    });

    it("DELETE por otro usuario → 403", async () => {
      const res = await req(
        "DELETE",
        `/api/table-reservations/${ids.reservationId}`,
        undefined,
        sessions.b,
      );
      expect(res.status).toBe(403);
    });

    it("DELETE por el solicitante → CANCELLED y libera el cupo", async () => {
      const res = await req(
        "DELETE",
        `/api/table-reservations/${ids.reservationId}`,
        undefined,
        sessions.a,
      );
      expect(res.status).toBe(200);
      expect((await res.json()).status).toBe("CANCELLED");

      // sale del listado público
      const list = await (
        await req(
          "GET",
          `/api/events/${ids.rateEventId}/table-reservations`,
          undefined,
          sessions.b,
        )
      ).json();
      expect(list).toEqual([]);

      // y puede volver a solicitar
      const again = await req(
        "POST",
        `/api/events/${ids.rateEventId}/table-reservations`,
        { partySize: 2 },
        sessions.a,
      );
      expect(again.status).toBe(201);
      expect((await again.json()).status).toBe("REQUESTED");
    });
  });

  // ═══════════════════════ SONG SUGGESTIONS ═══════════════════════
  describe("song suggestions en checkout + top-N", () => {
    const pay = async (paymentId: string, status: "PAID" | "FAILED") => {
      const payment = await prisma.payment.findUniqueOrThrow({
        where: { id: paymentId },
      });
      const res = await req("POST", "/api/payments/webhook", {
        refId: payment.refId,
        status,
      });
      expect(res.status).toBe(200);
    };

    it("checkout con songSuggestion crea la sugerencia normalizada", async () => {
      const res = await req(
        "POST",
        "/api/checkout/ticket",
        { eventId: ids.suggestEventId, songSuggestion: "  La   Rebelión  " },
        sessions.a,
      );
      expect(res.status).toBe(201);
      const { paymentId } = await res.json();

      const rows = await prisma.songSuggestion.findMany({
        where: { eventId: ids.suggestEventId, personId: ids.aId },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0].title).toBe("La Rebelión"); // trim + espacios colapsados

      // aún sin ticket pagado: el top-N no la cuenta
      const top = await (
        await req(
          "GET",
          `/api/events/${ids.suggestEventId}/song-suggestions`,
          undefined,
          sessions.producer,
        )
      ).json();
      expect(top).toEqual([]);

      // pago confirmado → cuenta
      await pay(paymentId, "PAID");
      const top2 = await (
        await req(
          "GET",
          `/api/events/${ids.suggestEventId}/song-suggestions`,
          undefined,
          sessions.producer,
        )
      ).json();
      expect(top2).toEqual([{ title: "la rebelión", count: 1 }]);
    });

    it("deduplica por título normalizado entre compradores", async () => {
      const res = await req(
        "POST",
        "/api/checkout/ticket",
        { eventId: ids.suggestEventId, songSuggestion: "la rebelión" },
        sessions.b,
      );
      const { paymentId } = await res.json();
      await pay(paymentId, "PAID");

      const top = await (
        await req(
          "GET",
          `/api/events/${ids.suggestEventId}/song-suggestions`,
          undefined,
          sessions.producer,
        )
      ).json();
      expect(top).toEqual([{ title: "la rebelión", count: 2 }]);
    });

    it("pago FAILED: la sugerencia nunca entra al top-N", async () => {
      const res = await req(
        "POST",
        "/api/checkout/ticket",
        { eventId: ids.suggestEventId, songSuggestion: "Aguanilé" },
        sessions.c,
      );
      const { paymentId } = await res.json();
      await pay(paymentId, "FAILED");

      const top = await (
        await req(
          "GET",
          `/api/events/${ids.suggestEventId}/song-suggestions`,
          undefined,
          sessions.producer,
        )
      ).json();
      expect(top).toEqual([{ title: "la rebelión", count: 2 }]);
    });

    it("un nuevo checkout del comprador reemplaza su sugerencia anterior", async () => {
      const res = await req(
        "POST",
        "/api/checkout/ticket",
        { eventId: ids.suggestEventId, songSuggestion: "Otra Canción" },
        sessions.a,
      );
      const { paymentId } = await res.json();
      await pay(paymentId, "PAID");

      const rows = await prisma.songSuggestion.findMany({
        where: { eventId: ids.suggestEventId, personId: ids.aId },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0].title).toBe("Otra Canción");

      const top = await (
        await req(
          "GET",
          `/api/events/${ids.suggestEventId}/song-suggestions`,
          undefined,
          sessions.producer,
        )
      ).json();
      // "la rebelión" baja a 1 (solo B); "otra canción" entra con 1
      expect(top).toContainEqual({ title: "la rebelión", count: 1 });
      expect(top).toContainEqual({ title: "otra canción", count: 1 });
    });

    it("checkout sin songSuggestion no crea nada", async () => {
      const res = await req(
        "POST",
        "/api/checkout/ticket",
        { eventId: ids.suggestEventId },
        sessions.d,
      );
      expect(res.status).toBe(201);
      const count = await prisma.songSuggestion.count({
        where: { personId: ids.dId },
      });
      expect(count).toBe(0);
    });

    it("acceso al ranking: bailarín ajeno → 403; DJ y admin → 200", async () => {
      const forbidden = await req(
        "GET",
        `/api/events/${ids.suggestEventId}/song-suggestions`,
        undefined,
        sessions.c,
      );
      expect(forbidden.status).toBe(403);

      const byDj = await req(
        "GET",
        `/api/events/${ids.suggestEventId}/song-suggestions`,
        undefined,
        sessions.dj,
      );
      expect(byDj.status).toBe(200);
      expect(Array.isArray(await byDj.json())).toBe(true);

      const byAdmin = await req(
        "GET",
        `/api/events/${ids.suggestEventId}/song-suggestions`,
        undefined,
        sessions.admin,
      );
      expect(byAdmin.status).toBe(200);
    });
  });
});
