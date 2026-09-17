import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import { AppModule } from "../src/app.module";
import { AuthService } from "../src/auth/domain/auth.service";
import { PrismaService } from "../src/prisma.service";

describe("GET /api/me", () => {
  let app: INestApplication;
  let baseUrl: string;
  let prisma: PrismaService;
  const auth = new AuthService(process.env.JWT_SECRET ?? "dev-secret-change-me");

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api");
    await app.init();
    await app.listen(0);
    prisma = app.get(PrismaService);
    const address = app.getHttpServer().address();
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(() => app.close());

  it("sin cookie → 401", async () => {
    const res = await fetch(`${baseUrl}/api/me`);
    expect(res.status).toBe(401);
  });

  it("con sesión de person inexistente → 401", async () => {
    const session = await auth.issueSession("no-existe");
    const res = await fetch(`${baseUrl}/api/me`, {
      headers: { cookie: `omnidance_session=${session}` },
    });
    expect(res.status).toBe(401);
  });

  it("con sesión válida → 200 con id y roles", async () => {
    const person = await prisma.person.findFirstOrThrow({
      where: { email: "admin@omnidance.dev" },
    });
    const session = await auth.issueSession(person.id);
    const res = await fetch(`${baseUrl}/api/me`, {
      headers: { cookie: `omnidance_session=${session}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(person.id);
    expect(Array.isArray(body.roles)).toBe(true);
    expect(body.roles).toContain("ADMIN");
  });
});
