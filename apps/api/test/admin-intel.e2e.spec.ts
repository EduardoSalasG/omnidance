import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Test } from "@nestjs/testing";
import { ValidationPipe, type INestApplication } from "@nestjs/common";
import { AuthModule } from "../src/auth/auth.module";
import { AuthService } from "../src/auth/domain/auth.service";
import { AdminModule } from "../src/admin/admin.module";
import { PrismaService } from "../src/prisma.service";

/**
 * admin-user-intel: ficha de usuario, analítica por rol y explorador
 * de datos. Todo read-only — el spec no crea ni muta data, usa las
 * personas del seed dev (*@omnidance.dev).
 */
describe("admin user intel e2e", () => {
  let app: INestApplication;
  let baseUrl: string;
  let prisma: PrismaService;
  const auth = new AuthService(
    process.env.JWT_SECRET ?? "dev-secret-change-me",
  );

  let adminSession: string;
  let dancerSession: string;
  let dancerId: string;

  const req = (method: string, path: string, session?: string) =>
    fetch(`${baseUrl}${path}`, {
      method,
      headers: session ? { cookie: `omnidance_session=${session}` } : {},
    });
  const get = (path: string, session?: string) => req("GET", path, session);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AdminModule, AuthModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api");
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    await app.listen(0);
    prisma = app.get(PrismaService);
    const address = app.getHttpServer().address();
    baseUrl = `http://127.0.0.1:${address.port}`;

    const admin = await prisma.person.findFirstOrThrow({
      where: { email: "admin@omnidance.dev" },
    });
    adminSession = await auth.issueSession(admin.id);

    const dancer = await prisma.person.findFirstOrThrow({
      where: { email: "dancer@omnidance.dev" },
    });
    dancerId = dancer.id;
    dancerSession = await auth.issueSession(dancer.id);
  });

  afterAll(async () => {
    await app.close();
  });

  describe("acceso", () => {
    it("sin sesión → 401", async () => {
      const res = await get(`/api/admin/users/${dancerId}/detail`);
      expect(res.status).toBe(401);
    });

    it("dancer sin admin.access → 403", async () => {
      const res = await get(
        `/api/admin/users/${dancerId}/detail`,
        dancerSession,
      );
      expect(res.status).toBe(403);
    });
  });

  describe("GET /api/admin/users?q=", () => {
    it("q ausente → []", async () => {
      const res = await get("/api/admin/users", adminSession);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual([]);
    });

    it("q de 1 char → []", async () => {
      const res = await get("/api/admin/users?q=a", adminSession);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual([]);
    });

    it("q ≥2 encuentra por email parcial", async () => {
      const res = await get("/api/admin/users?q=dancer@", adminSession);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.some((p: { id: string }) => p.id === dancerId)).toBe(true);
    });
  });

  describe("GET /api/admin/users/:personId/detail", () => {
    it("persona fantasma → 404", async () => {
      const res = await get(
        "/api/admin/users/persona-fantasma/detail",
        adminSession,
      );
      expect(res.status).toBe(404);
    });

    it("dancer@ incluye roleData.DANCER y nunca secretos", async () => {
      const res = await get(
        `/api/admin/users/${dancerId}/detail`,
        adminSession,
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.person.id).toBe(dancerId);
      expect(body.person.email).toBe("dancer@omnidance.dev");
      expect(body.person.passwordHash).toBeUndefined();
      expect(body.person.qrSecret).toBeUndefined();
      expect(
        body.roles.some(
          (r: { role: string }) => r.role === "DANCER",
        ),
      ).toBe(true);
      const dancer = body.roleData.DANCER;
      expect(dancer).toBeDefined();
      expect(Array.isArray(dancer.ticketsUpcoming)).toBe(true);
      expect(Array.isArray(dancer.ticketsPast)).toBe(true);
      expect(typeof dancer.dancesCount).toBe("number");
      expect(typeof dancer.checkinsCount).toBe("number");
    });
  });

  describe("GET /api/admin/users/:personId/analytics?role=", () => {
    it("rol no poseído → 400 ROLE_NOT_HELD", async () => {
      const res = await get(
        `/api/admin/users/${dancerId}/analytics?role=DJ`,
        adminSession,
      );
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("ROLE_NOT_HELD");
    });

    it("sin role → 400", async () => {
      const res = await get(
        `/api/admin/users/${dancerId}/analytics`,
        adminSession,
      );
      expect(res.status).toBe(400);
    });

    it("DANCER → sections.social con campos numéricos", async () => {
      const res = await get(
        `/api/admin/users/${dancerId}/analytics?role=DANCER`,
        adminSession,
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.role).toBe("DANCER");
      const social = body.sections.social;
      expect(social).toBeDefined();
      expect(typeof social.totalSpentClp).toBe("number");
      expect(typeof social.monthSpentClp).toBe("number");
      expect(typeof social.monthlyAvgClp).toBe("number");
      expect(typeof social.dancesCount).toBe("number");
      expect(typeof social.seasonPoints).toBe("number");
      expect(Array.isArray(social.favoriteEvents)).toBe(true);
      expect(Array.isArray(social.badges)).toBe(true);
      const academy = body.sections.academy;
      expect(academy).toBeDefined();
      expect(Array.isArray(academy.activeEnrollments)).toBe(true);
      expect(typeof academy.classesTaken).toBe("number");
      expect(typeof academy.totalPaidClp).toBe("number");
    });

    it("INSTRUCTOR (profe@) → sections por rol", async () => {
      const profe = await prisma.person.findFirstOrThrow({
        where: { email: "profe@omnidance.dev" },
      });
      const res = await get(
        `/api/admin/users/${profe.id}/analytics?role=INSTRUCTOR`,
        adminSession,
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.role).toBe("INSTRUCTOR");
      expect(Array.isArray(body.sections.academies)).toBe(true);
      expect(typeof body.sections.classesTaught).toBe("number");
    });
  });

  describe("GET /api/admin/browse/:entity", () => {
    it("events?status=PUBLISHED filtra", async () => {
      const res = await get(
        "/api/admin/browse/events?status=PUBLISHED",
        adminSession,
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBeGreaterThan(0);
      for (const e of body) {
        expect(e.status).toBe("PUBLISHED");
        expect(typeof e.sold).toBe("number");
      }
    });

    it("events?status inválido → 400", async () => {
      const res = await get(
        "/api/admin/browse/events?status=NOPE",
        adminSession,
      );
      expect(res.status).toBe(400);
    });

    it("entidad inválida → 400", async () => {
      const res = await get("/api/admin/browse/chupallamas", adminSession);
      expect(res.status).toBe(400);
    });

    it("people?q= encuentra por email parcial", async () => {
      const res = await get(
        "/api/admin/browse/people?q=dancer@omni",
        adminSession,
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.some((p: { id: string }) => p.id === dancerId)).toBe(true);
    });

    it("people sin q ni role → []", async () => {
      const res = await get("/api/admin/browse/people", adminSession);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual([]);
    });
  });
});
