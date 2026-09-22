import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Test } from "@nestjs/testing";
import { ValidationPipe, type INestApplication } from "@nestjs/common";
import { AuthModule } from "../src/auth/auth.module";
import { AuthService } from "../src/auth/domain/auth.service";
import { AcademiesModule } from "../src/academies/academies.module";
import { DjController } from "../src/events/infrastructure/dj.controller";
import { EventsController } from "../src/events/infrastructure/events.controller";
import { VenueConsoleController } from "../src/social/infrastructure/venue-console.controller";
import { PrismaService } from "../src/prisma.service";

/**
 * role-console-depth — endpoints de las consolas B2B (spec §13):
 *  - GET /dj/gigs/:eventId/rating (agregado música, k-anonymity)
 *  - GET /venues/:id/dashboard (tables + flow)
 *  - GET /academies/:id/dashboard (todayClasses + attendanceToday)
 *  - GET /events/mine (stats por evento) + GET /events/:id/live
 */
describe("role-console-depth e2e", () => {
  let app: INestApplication;
  let baseUrl: string;
  let prisma: PrismaService;
  const auth = new AuthService(process.env.JWT_SECRET ?? "dev-secret-change-me");

  const suffix = Date.now().toString(36);
  const sessions: Record<string, string> = {};
  const ids: Record<string, string> = {};
  const createdPersonIds: string[] = [];

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
  const get = (path: string, session?: string) =>
    req("GET", path, undefined, session);

  const mkPerson = async (name: string, role = "DANCER") => {
    const p = await prisma.person.create({
      data: { name, roles: { create: [{ role, status: "APPROVED" }] } },
    });
    createdPersonIds.push(p.id);
    return { id: p.id, session: await auth.issueSession(p.id) };
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AcademiesModule, AuthModule],
      controllers: [DjController, EventsController, VenueConsoleController],
      providers: [PrismaService],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api");
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
    await app.listen(0);
    prisma = app.get(PrismaService);
    baseUrl = `http://127.0.0.1:${app.getHttpServer().address().port}`;

    const [producer, dj, otherDj, venueMgr, academyOwner, outsider, admin] =
      await Promise.all([
        mkPerson(`RCD Productor ${suffix}`, "PRODUCER"),
        mkPerson(`RCD DJ ${suffix}`, "DJ"),
        mkPerson(`RCD DJ ajeno ${suffix}`, "DJ"),
        mkPerson(`RCD Venue ${suffix}`, "VENUE_MANAGER"),
        mkPerson(`RCD Academy ${suffix}`, "ACADEMY_OWNER"),
        mkPerson(`RCD Outsider ${suffix}`),
        mkPerson(`RCD Admin ${suffix}`, "ADMIN"),
      ]);
    Object.assign(ids, {
      producerId: producer.id,
      djId: dj.id,
      otherDjId: otherDj.id,
      venueMgrId: venueMgr.id,
      academyOwnerId: academyOwner.id,
      outsiderId: outsider.id,
      adminId: admin.id,
    });
    Object.assign(sessions, {
      producer: producer.session,
      dj: dj.session,
      otherDj: otherDj.session,
      venueMgr: venueMgr.session,
      academyOwner: academyOwner.session,
      outsider: outsider.session,
      admin: admin.session,
    });

    // ─── Venue del manager ───
    const venue = await prisma.venue.create({
      data: { name: `RCD Venue ${suffix}`, ownerId: venueMgr.id, capacity: 100 },
    });
    ids.venueId = venue.id;

    // ─── Evento futuro del productor (ventas + reserva de mesa) ───
    const future = await prisma.event.create({
      data: {
        name: `RCD Futuro ${suffix}`,
        type: "SOCIAL",
        status: "PUBLISHED",
        startsAt: new Date(Date.now() + 7 * 86_400_000),
        endsAt: new Date(Date.now() + 7 * 86_400_000 + 6 * 3_600_000),
        venueId: venue.id,
        producerId: producer.id,
        presalePrice: 5000,
        capacity: 100,
      },
    });
    ids.futureEventId = future.id;
    await prisma.eventDj.create({
      data: { eventId: future.id, personId: dj.id },
    });
    await prisma.ticket.create({
      data: {
        eventId: future.id,
        ownerId: outsider.id,
        buyerId: outsider.id,
        listPrice: 5000,
        serviceFee: 500,
        status: "ACTIVE",
      },
    });
    await prisma.payment.create({
      data: {
        orderType: "TICKET",
        refId: `rcd-future-${suffix}`,
        personId: outsider.id,
        eventId: future.id,
        amount: 5500,
        fee: 200,
        net: 5300,
        status: "PAID",
        channel: "PRESALE",
        quantity: 1,
      },
    });
    await prisma.tableReservation.create({
      data: {
        eventId: future.id,
        personId: outsider.id,
        partySize: 4,
        tableNo: "M1",
        status: "CONFIRMED",
      },
    });

    // ─── Evento LIVE del productor (canal DOOR + check-ins) ───
    const live = await prisma.event.create({
      data: {
        name: `RCD Live ${suffix}`,
        type: "SOCIAL",
        status: "LIVE",
        startsAt: new Date(Date.now() - 2 * 3_600_000),
        endsAt: new Date(Date.now() + 4 * 3_600_000),
        venueId: venue.id,
        producerId: producer.id,
        doorPrice: 7000,
        capacity: 200,
      },
    });
    ids.liveEventId = live.id;
    await prisma.checkin.create({
      data: {
        eventId: live.id,
        personId: outsider.id,
        method: "SCAN",
        inAt: new Date(Date.now() - 30 * 60_000),
      },
    });
    await prisma.checkin.create({
      data: {
        eventId: live.id,
        personId: dj.id,
        method: "MANUAL",
        inAt: new Date(Date.now() - 20 * 60_000),
      },
    });
    await prisma.payment.create({
      data: {
        orderType: "TICKET",
        refId: `rcd-door-${suffix}`,
        personId: outsider.id,
        eventId: live.id,
        amount: 7700,
        fee: 230,
        net: 7470,
        status: "PAID",
        channel: "DOOR",
        quantity: 1,
      },
    });

    // ─── Evento pasado del venue: flujo (inAt/outAt) + ratings ───
    const past = await prisma.event.create({
      data: {
        name: `RCD Pasado ${suffix}`,
        type: "SOCIAL",
        status: "CLOSED",
        startsAt: new Date(Date.now() - 3 * 86_400_000),
        endsAt: new Date(Date.now() - 3 * 86_400_000 + 6 * 3_600_000),
        venueId: venue.id,
        producerId: producer.id,
      },
    });
    ids.pastEventId = past.id;
    await prisma.eventDj.create({
      data: { eventId: past.id, personId: dj.id },
    });
    // 3 check-ins: 22:00→01:00 (3h), 23:00→02:00 (3h), 22:00→sin salida.
    const base = Date.now() - 3 * 86_400_000;
    const mkIn = (h: number, personId: string, outAt?: Date) =>
      prisma.checkin.create({
        data: {
          eventId: past.id,
          personId,
          method: "SCAN",
          inAt: new Date(base + h * 3_600_000),
          outAt,
        },
      });
    await mkIn(22, outsider.id, new Date(base + 25 * 3_600_000));
    await mkIn(23, dj.id, new Date(base + 26 * 3_600_000));
    await mkIn(22, academyOwner.id);
    // ≥3 evaluaciones con music → promedio expuesto para el DJ.
    for (const [rater, music] of [
      [outsider.id, 4],
      [academyOwner.id, 5],
      [venueMgr.id, 4],
    ] as const) {
      await prisma.eventRating.create({
        data: {
          eventId: past.id,
          raterId: rater,
          music,
          occupation: 4,
          floorComfort: 4,
        },
      });
    }

    // ─── Evento pasado bajo el umbral (1 rating) ───
    const low = await prisma.event.create({
      data: {
        name: `RCD Low ${suffix}`,
        type: "SOCIAL",
        status: "CLOSED",
        startsAt: new Date(Date.now() - 4 * 86_400_000),
        endsAt: new Date(Date.now() - 4 * 86_400_000 + 6 * 3_600_000),
        venueId: venue.id,
        producerId: producer.id,
      },
    });
    ids.lowEventId = low.id;
    await prisma.eventDj.create({
      data: { eventId: low.id, personId: dj.id },
    });
    await prisma.eventRating.create({
      data: { eventId: low.id, raterId: outsider.id, music: 5 },
    });

    // ─── Academia del owner + clase de hoy ───
    const academy = await prisma.academy.create({
      data: { name: `RCD Academia ${suffix}`, ownerId: academyOwner.id },
    });
    ids.academyId = academy.id;
    const now = new Date();
    const todayUTC = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const series = await prisma.classSeries.create({
      data: {
        academyId: academy.id,
        name: `RCD Serie ${suffix}`,
        month: `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`,
      },
    });
    const slot = await prisma.classSlot.create({
      data: {
        academyId: academy.id,
        seriesId: series.id,
        weekday: now.getUTCDay(),
        startTime: "19:00",
        endTime: "20:30",
        capacity: 15,
      },
    });
    const cls = await prisma.class.create({
      data: { classSlotId: slot.id, date: todayUTC },
    });
    ids.classId = cls.id;
    await prisma.classBooking.create({
      data: { classId: cls.id, personId: outsider.id, status: "BOOKED" },
    });
    await prisma.attendance.create({
      data: { classId: cls.id, personId: dj.id },
    });
  }, 60_000);

  afterAll(async () => {
    const eventIds = [
      ids.futureEventId,
      ids.liveEventId,
      ids.pastEventId,
      ids.lowEventId,
    ].filter(Boolean);
    await prisma.eventRating.deleteMany({ where: { eventId: { in: eventIds } } });
    await prisma.eventDj.deleteMany({ where: { eventId: { in: eventIds } } });
    await prisma.checkin.deleteMany({ where: { eventId: { in: eventIds } } });
    await prisma.ticket.deleteMany({ where: { eventId: { in: eventIds } } });
    await prisma.payment.deleteMany({ where: { eventId: { in: eventIds } } });
    await prisma.tableReservation.deleteMany({
      where: { eventId: { in: eventIds } },
    });
    await prisma.event.deleteMany({ where: { id: { in: eventIds } } });
    if (ids.classId) {
      await prisma.attendance.deleteMany({ where: { classId: ids.classId } });
      await prisma.classBooking.deleteMany({ where: { classId: ids.classId } });
      await prisma.class.deleteMany({ where: { id: ids.classId } });
    }
    await prisma.classSlot.deleteMany({ where: { academyId: ids.academyId } });
    await prisma.classSeries.deleteMany({ where: { academyId: ids.academyId } });
    await prisma.academy.deleteMany({ where: { id: ids.academyId } });
    await prisma.venue.deleteMany({ where: { id: ids.venueId } });
    if (createdPersonIds.length) {
      await prisma.personRole.deleteMany({
        where: { personId: { in: createdPersonIds } },
      });
      await prisma.person.deleteMany({ where: { id: { in: createdPersonIds } } });
    }
    await app.close();
  }, 30_000);

  // ─── DJ: evaluación agregada de música ───

  it("GET /dj/gigs/:id/rating — DJ asignado ve el promedio agregado", async () => {
    const res = await get(
      `/api/dj/gigs/${ids.pastEventId}/rating`,
      sessions.dj,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.exposed).toBe(true);
    expect(body.count).toBe(3);
    expect(body.music.avg).toBeCloseTo(13 / 3);
    expect(body.music.count).toBe(3);
  });

  it("GET /dj/gigs/:id/rating — bajo el umbral no expone promedio", async () => {
    const res = await get(
      `/api/dj/gigs/${ids.lowEventId}/rating`,
      sessions.dj,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.exposed).toBe(false);
    expect(body.count).toBe(1);
    expect(body.music).toBeNull();
  });

  it("GET /dj/gigs/:id/rating — DJ no asignado recibe 403", async () => {
    const res = await get(
      `/api/dj/gigs/${ids.pastEventId}/rating`,
      sessions.otherDj,
    );
    expect(res.status).toBe(403);
  });

  it("GET /dj/gigs/:id/rating — admin puede ver cualquier evento", async () => {
    const res = await get(
      `/api/dj/gigs/${ids.pastEventId}/rating`,
      sessions.admin,
    );
    expect(res.status).toBe(200);
    expect((await res.json()).exposed).toBe(true);
  });

  // ─── Venue: mesas + flujo ───

  it("GET /venues/:id/dashboard — owner ve reservas de mesa próximas", async () => {
    const res = await get(
      `/api/venues/${ids.venueId}/dashboard`,
      sessions.venueMgr,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.tables)).toBe(true);
    const table = body.tables.find(
      (r: { event: { id: string } }) => r.event.id === ids.futureEventId,
    );
    expect(table).toBeTruthy();
    expect(table.status).toBe("CONFIRMED");
    expect(table.partySize).toBe(4);
    expect(table.tableNo).toBe("M1");
  });

  it("GET /venues/:id/dashboard — flow con peak hour y permanencia", async () => {
    const res = await get(
      `/api/venues/${ids.venueId}/dashboard`,
      sessions.venueMgr,
    );
    const body = await res.json();
    expect(body.flow.checkins).toBeGreaterThanOrEqual(5);
    expect(body.flow.byHour).toHaveLength(24);
    // Los check-ins del evento pasado (22h×2 + 23h) + LIVE (ahora) —
    // el peak puede variar según la hora de ejecución del test.
    expect(body.flow.peakHour).not.toBeNull();
    // Permanencia: 2 con outAt de 3h → 180 min de promedio mínimo.
    expect(body.flow.avgStayMinutes).toBeGreaterThanOrEqual(150);
  });

  it("GET /venues/:id/dashboard — outsider recibe 403", async () => {
    const res = await get(
      `/api/venues/${ids.venueId}/dashboard`,
      sessions.outsider,
    );
    expect(res.status).toBe(403);
  });

  // ─── Academia: clases del día ───

  it("GET /academies/:id/dashboard — clases de hoy + asistencia de hoy", async () => {
    const res = await get(
      `/api/academies/${ids.academyId}/dashboard`,
      sessions.academyOwner,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.attendanceToday).toBe(1);
    expect(Array.isArray(body.todayClasses)).toBe(true);
    const cls = body.todayClasses.find(
      (c: { id: string }) => c.id === ids.classId,
    );
    expect(cls).toBeTruthy();
    expect(cls.startTime).toBe("19:00");
    expect(cls.bookedCount).toBe(1);
    expect(cls.capacity).toBe(15);
    // Los KPIs existentes se preservan.
    expect(body).toHaveProperty("studentsByStatus");
    expect(body).toHaveProperty("attendanceLast30d");
  });

  // ─── Productor: stats por evento + live ───

  it("GET /events/mine — cada evento trae stats {sold, grossClp, checkins}", async () => {
    const res = await get("/api/events/mine", sessions.producer);
    expect(res.status).toBe(200);
    const events = await res.json();
    const future = events.find(
      (e: { id: string }) => e.id === ids.futureEventId,
    );
    expect(future).toBeTruthy();
    expect(future.stats.sold).toBe(1);
    expect(future.stats.grossClp).toBe(5500);
    const live = events.find((e: { id: string }) => e.id === ids.liveEventId);
    expect(live.stats.checkins).toBe(2);
  });

  it("GET /events/:id/live — ventas por canal + check-ins + ocupación", async () => {
    const res = await get(`/api/events/${ids.liveEventId}/live`, sessions.producer);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sales.door.count).toBe(1);
    expect(body.sales.door.amount).toBe(7700);
    expect(body.sales.door.manual).toBe(1);
    expect(body.checkins.total).toBe(2);
    expect(body.checkins.byHour).toHaveLength(24);
    expect(body.occupancy).toBeCloseTo(2 / 200);
  });

  it("GET /events/:id/live — otro productor/persona recibe 403", async () => {
    const res = await get(`/api/events/${ids.liveEventId}/live`, sessions.outsider);
    expect(res.status).toBe(403);
  });
});
