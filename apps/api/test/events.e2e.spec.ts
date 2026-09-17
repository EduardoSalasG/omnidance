import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import { AppModule } from "../src/app.module";

describe("GET /api/events", () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api");
    await app.init();
    await app.listen(0);
    baseUrl = `http://127.0.0.1:${app.getHttpServer().address().port}`;
  });

  afterAll(() => app.close());

  it("lista eventos publicados con shape público", async () => {
    const res = await fetch(`${baseUrl}/api/events`);
    expect(res.status).toBe(200);
    const events = await res.json();
    expect(Array.isArray(events)).toBe(true);
    expect(events.length).toBeGreaterThan(0);
    const e = events[0];
    expect(e).toHaveProperty("id");
    expect(e).toHaveProperty("name");
    expect(e).toHaveProperty("startsAt");
    expect(e.venue).toHaveProperty("name");
    expect(["PUBLISHED", "LIVE"]).toContain(e.status);
  });

  it("detalle incluye djs y venue", async () => {
    const list = await (await fetch(`${baseUrl}/api/events`)).json();
    const res = await fetch(`${baseUrl}/api/events/${list[0].id}`);
    expect(res.status).toBe(200);
    const detail = await res.json();
    expect(detail.id).toBe(list[0].id);
    expect(detail).toHaveProperty("djs");
    expect(detail.venue).toHaveProperty("name");
  });

  it("id inexistente → 404", async () => {
    const res = await fetch(`${baseUrl}/api/events/no-existe`);
    expect(res.status).toBe(404);
  });
});
