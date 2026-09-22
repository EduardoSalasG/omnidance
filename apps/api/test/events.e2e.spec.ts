import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma.service";

// Suite autocontenida: crea su propio venue+evento para no depender del seed
// ni de la suerte del orden — otras suites e2e comparten la misma DB y
// borran fixtures en paralelo.
describe("GET /api/events", () => {
  let app: INestApplication;
  let baseUrl: string;
  let prisma: PrismaService;
  let eventId: string;
  let practiceId: string;
  let venueId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api");
    await app.init();
    await app.listen(0);
    prisma = app.get(PrismaService);
    baseUrl = `http://127.0.0.1:${app.getHttpServer().address().port}`;

    const suffix = Date.now().toString(36);
    const venue = await prisma.venue.create({
      data: {
        name: `Venue E2E ${suffix}`,
        address: "Santiago",
        lat: -33.42,
        lng: -70.64,
      },
    });
    venueId = venue.id;
    const event = await prisma.event.create({
      data: {
        name: `Social E2E ${suffix}`,
        type: "SOCIAL",
        status: "PUBLISHED",
        genres: ["SALSA"],
        startsAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
        endsAt: new Date(Date.now() + 7 * 24 * 3600 * 1000 + 6 * 3600 * 1000),
        venueId: venue.id,
        tablesTotal: 3,
      },
    });
    eventId = event.id;
    // 1 activa (ocupa) + 1 cancelada (no ocupa) → tablesLeft = 2
    await prisma.tableReservation.createMany({
      data: [
        { eventId: event.id, personId: "e2e-a", partySize: 4, status: "CONFIRMED" },
        { eventId: event.id, personId: "e2e-b", partySize: 2, status: "CANCELLED" },
      ],
    });
    const practice = await prisma.event.create({
      data: {
        name: `Práctica E2E ${suffix}`,
        type: "PRACTICA",
        status: "PUBLISHED",
        startsAt: new Date(Date.now() + 3 * 24 * 3600 * 1000),
        endsAt: new Date(Date.now() + 3 * 24 * 3600 * 1000 + 2 * 3600 * 1000),
      },
    });
    practiceId = practice.id;
  });

  afterAll(async () => {
    await prisma.tableReservation.deleteMany({ where: { eventId } });
    await prisma.event.deleteMany({ where: { id: { in: [eventId, practiceId] } } });
    await prisma.venue.deleteMany({ where: { id: venueId } });
    await app.close();
  });

  it("lista eventos publicados con shape público", async () => {
    const res = await fetch(`${baseUrl}/api/events`);
    expect(res.status).toBe(200);
    const events = await res.json();
    expect(Array.isArray(events)).toBe(true);
    expect(events.length).toBeGreaterThan(0);
    const mine = events.find((e: { id: string }) => e.id === eventId);
    expect(mine).toBeTruthy();
    expect(mine).toHaveProperty("name");
    expect(mine).toHaveProperty("startsAt");
    expect(mine.venue).toHaveProperty("name");
    expect(["PUBLISHED", "LIVE"]).toContain(mine.status);
  });

  it("no incluye prácticas — viven en /practices", async () => {
    const res = await fetch(`${baseUrl}/api/events`);
    const events = await res.json();
    expect(events.some((e: { id: string }) => e.id === practiceId)).toBe(false);
    expect(events.every((e: { type: string }) => e.type !== "PRACTICA")).toBe(true);
  });

  it("expone lat/lng del venue para 'cerca de ti'", async () => {
    const res = await fetch(`${baseUrl}/api/events`);
    const events = await res.json();
    const mine = events.find((e: { id: string }) => e.id === eventId);
    expect(mine.venue.lat).toBeCloseTo(-33.42);
    expect(mine.venue.lng).toBeCloseTo(-70.64);
  });

  it("detalle incluye djs y venue", async () => {
    const res = await fetch(`${baseUrl}/api/events/${eventId}`);
    expect(res.status).toBe(200);
    const detail = await res.json();
    expect(detail.id).toBe(eventId);
    expect(detail).toHaveProperty("djs");
    expect(detail.venue).toHaveProperty("name");
  });

  it("id inexistente → 404", async () => {
    const res = await fetch(`${baseUrl}/api/events/no-existe`);
    expect(res.status).toBe(404);
  });

  it("detalle expone disponibilidad de mesas dinámica (REQUESTED/CONFIRMED ocupan, CANCELLED libera)", async () => {
    const res = await fetch(`${baseUrl}/api/events/${eventId}`);
    const detail = await res.json();
    expect(detail.tablesTotal).toBe(3);
    expect(detail.tablesLeft).toBe(2); // 3 total − 1 CONFIRMED (la CANCELLED no cuenta)
  });

  it("evento sin tablesTotal → tablesLeft null (no ofrece mesas)", async () => {
    const res = await fetch(`${baseUrl}/api/events/${practiceId}`);
    const detail = await res.json();
    expect(detail.tablesTotal).toBeNull();
    expect(detail.tablesLeft).toBeNull();
  });

  it("?genre= filtra por género propio o heredado de la serie", async () => {
    const res = await fetch(`${baseUrl}/api/events?genre=SALSA`);
    expect(res.status).toBe(200);
    const events = await res.json();
    const mine = events.find((e: { id: string }) => e.id === eventId);
    expect(mine).toBeTruthy();
    expect(mine.genres).toContain("SALSA");
    // Ningún evento sin salsa en sus géneros resueltos.
    expect(events.every((e: { genres: string[] }) => e.genres.includes("SALSA"))).toBe(true);
  });

  it("?genre= acepta lista CSV (unión de géneros)", async () => {
    const res = await fetch(`${baseUrl}/api/events?genre=SALSA,BACHATA`);
    expect(res.status).toBe(200);
    const events = await res.json();
    expect(events.length).toBeGreaterThan(0);
    expect(
      events.every((e: { genres: string[] }) =>
        e.genres.some((g) => ["SALSA", "BACHATA"].includes(g)),
      ),
    ).toBe(true);
  });

  it("?genre= CSV con miembro inválido → 400", async () => {
    const res = await fetch(`${baseUrl}/api/events?genre=SALSA,HACK`);
    expect(res.status).toBe(400);
  });

  it("?genre= inválido → 400", async () => {
    const res = await fetch(`${baseUrl}/api/events?genre=HACK`);
    expect(res.status).toBe(400);
  });

  it("?venue= filtra por local", async () => {
    const res = await fetch(`${baseUrl}/api/events?venue=${venueId}`);
    expect(res.status).toBe(200);
    const events = await res.json();
    expect(events.length).toBeGreaterThan(0);
    expect(
      events.every((e: { venue?: { id: string } }) => e.venue?.id === venueId),
    ).toBe(true);
  });

  it("?week=this solo devuelve eventos de los próximos 7 días", async () => {
    const res = await fetch(`${baseUrl}/api/events?week=this`);
    expect(res.status).toBe(200);
    const events = await res.json();
    const limit = Date.now() + 7 * 24 * 3600 * 1000;
    expect(
      events.every(
        (e: { startsAt: string }) => new Date(e.startsAt).getTime() <= limit,
      ),
    ).toBe(true);
  });
});
