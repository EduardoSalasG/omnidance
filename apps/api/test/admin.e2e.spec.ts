import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Test } from "@nestjs/testing";
import { ValidationPipe, type INestApplication } from "@nestjs/common";
import { AuthModule } from "../src/auth/auth.module";
import { AuthService } from "../src/auth/domain/auth.service";
import { AdminModule } from "../src/admin/admin.module";
import { PrismaService } from "../src/prisma.service";

describe("admin role assignment e2e", () => {
  let app: INestApplication;
  let baseUrl: string;
  let prisma: PrismaService;
  const auth = new AuthService(
    process.env.JWT_SECRET ?? "dev-secret-change-me",
  );

  let adminSession: string;
  let dancerSession: string;

  const ids = { dancerId: "" };
  const createdPersonIds: string[] = [];

  const req = (method: string, path: string, body?: unknown, session?: string) =>
    fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        "content-type": "application/json",
        ...(session ? { cookie: `omnidance_session=${session}` } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  const get = (path: string, session?: string) =>
    req("GET", path, undefined, session);
  const post = (path: string, body: unknown, session?: string) =>
    req("POST", path, body, session);
  const del = (path: string, session?: string) =>
    req("DELETE", path, undefined, session);

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

    const dancer = await prisma.person.create({
      data: {
        name: "Bailarín Target Test",
        roles: { create: [{ role: "DANCER", status: "APPROVED" }] },
      },
    });
    ids.dancerId = dancer.id;
    createdPersonIds.push(dancer.id);
    dancerSession = await auth.issueSession(dancer.id);
  });

  afterAll(async () => {
    await prisma.personRole.deleteMany({
      where: { personId: { in: createdPersonIds } },
    });
    await prisma.person.deleteMany({ where: { id: { in: createdPersonIds } } });
    await app.close();
  });

  describe("auto-solicitud de roles eliminada", () => {
    it("POST /api/roles/request → 404 (endpoint removido)", async () => {
      const res = await post(
        "/api/roles/request",
        { role: "INSTRUCTOR" },
        dancerSession,
      );
      expect(res.status).toBe(404);
    });

    it("GET /api/roles/catalog → 404 (endpoint removido)", async () => {
      const res = await get("/api/roles/catalog", dancerSession);
      expect(res.status).toBe(404);
    });

    it("GET /api/admin/role-requests → 404 (cola removida)", async () => {
      const res = await get("/api/admin/role-requests", adminSession);
      expect(res.status).toBe(404);
    });
  });

  describe("POST /api/admin/users/:personId/roles", () => {
    it("sin sesión → 401", async () => {
      const res = await post(`/api/admin/users/${ids.dancerId}/roles`, {
        role: "INSTRUCTOR",
        status: "APPROVED",
      });
      expect(res.status).toBe(401);
    });

    it("sin rol ADMIN → 403", async () => {
      const res = await post(
        `/api/admin/users/${ids.dancerId}/roles`,
        { role: "INSTRUCTOR", status: "APPROVED" },
        dancerSession,
      );
      expect(res.status).toBe(403);
    });

    it("admin asigna rol directamente → status elegido", async () => {
      const res = await post(
        `/api/admin/users/${ids.dancerId}/roles`,
        { role: "INSTRUCTOR", status: "APPROVED" },
        adminSession,
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.role).toBe("INSTRUCTOR");
      expect(body.status).toBe("APPROVED");
      const role = await prisma.personRole.findUniqueOrThrow({
        where: {
          personId_role: { personId: ids.dancerId, role: "INSTRUCTOR" },
        },
      });
      expect(role.status).toBe("APPROVED");
    });

    it("re-asignación actualiza el status (upsert)", async () => {
      const res = await post(
        `/api/admin/users/${ids.dancerId}/roles`,
        { role: "INSTRUCTOR", status: "SANDBOX" },
        adminSession,
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("SANDBOX");
    });

    it("rol fuera del catálogo → 400", async () => {
      const res = await post(
        `/api/admin/users/${ids.dancerId}/roles`,
        { role: "SUPERVILLAIN", status: "APPROVED" },
        adminSession,
      );
      expect(res.status).toBe(400);
    });

    it("status inválido → 400", async () => {
      const res = await post(
        `/api/admin/users/${ids.dancerId}/roles`,
        { role: "DJ", status: "MAYBE" },
        adminSession,
      );
      expect(res.status).toBe(400);
    });

    it("persona inexistente → 404", async () => {
      const res = await post(
        "/api/admin/users/persona-fantasma/roles",
        { role: "DJ", status: "APPROVED" },
        adminSession,
      );
      expect(res.status).toBe(404);
    });
  });

  describe("DELETE /api/admin/users/:personId/roles/:role", () => {
    it("sin rol ADMIN → 403", async () => {
      const res = await del(
        `/api/admin/users/${ids.dancerId}/roles/INSTRUCTOR`,
        dancerSession,
      );
      expect(res.status).toBe(403);
    });

    it("admin revoca el rol → ok y fila eliminada", async () => {
      const res = await del(
        `/api/admin/users/${ids.dancerId}/roles/INSTRUCTOR`,
        adminSession,
      );
      expect(res.status).toBe(200);
      const role = await prisma.personRole.findUnique({
        where: {
          personId_role: { personId: ids.dancerId, role: "INSTRUCTOR" },
        },
      });
      expect(role).toBeNull();
    });

    it("rol que la persona no tiene → 404", async () => {
      const res = await del(
        `/api/admin/users/${ids.dancerId}/roles/DJ`,
        adminSession,
      );
      expect(res.status).toBe(404);
    });
  });
});
