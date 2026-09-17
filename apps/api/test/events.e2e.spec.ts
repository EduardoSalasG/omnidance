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
      data: { name: `Venue E2E ${suffix}`, address: "Santiago" },
    });
    const event = await prisma.event.create({
      data: {
        name: `Social E2E ${suffix}`,
        type: "SOCIAL",
        status: "PUBLISHED",
        startsAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
        endsAt: new Date(Date.now() + 7 * 24 * 3600 * 1000 + 6 * 3600 * 1000),
        venueId: venue.id,
      },
    });
    eventId = event.id;
  });

  afterAll(async () => {
    await prisma.event.deleteMany({ where: { id: eventId } });
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
});
