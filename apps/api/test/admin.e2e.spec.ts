import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Test } from "@nestjs/testing";
import { ValidationPipe, type INestApplication } from "@nestjs/common";
import { AuthModule } from "../src/auth/auth.module";
import { AuthService } from "../src/auth/domain/auth.service";
import { AdminModule } from "../src/admin/admin.module";
import { PrismaService } from "../src/prisma.service";

describe("admin role-requests e2e", () => {
  let app: INestApplication;
  let baseUrl: string;
  let prisma: PrismaService;
  const auth = new AuthService(
    process.env.JWT_SECRET ?? "dev-secret-change-me",
  );

  let adminSession: string;
  let dancerSession: string;

  const ids = {
    pendingPersonId: "",
    sandboxPersonId: "",
    dancerId: "",
    pendingRoleId: "",
    sandboxRoleId: "",
    requestedRoleId: "",
  };
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

    const pending = await prisma.person.create({
      data: {
        name: "Productor Pendiente Test",
        email: "pending-test@omnidance.cl",
        roles: { create: [{ role: "PRODUCER", status: "PENDING" }] },
      },
      include: { roles: true },
    });
    ids.pendingPersonId = pending.id;
    ids.pendingRoleId = pending.roles[0].id;
    createdPersonIds.push(pending.id);

    const sandbox = await prisma.person.create({
      data: {
        name: "Venue Sandbox Test",
        roles: { create: [{ role: "VENUE_MANAGER", status: "SANDBOX" }] },
      },
      include: { roles: true },
    });
    ids.sandboxPersonId = sandbox.id;
    ids.sandboxRoleId = sandbox.roles[0].id;
    createdPersonIds.push(sandbox.id);

    const dancer = await prisma.person.create({
      data: {
        name: "Bailarín Solicitante Test",
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

  describe("GET /api/admin/role-requests", () => {
    it("sin sesión → 401", async () => {
      const res = await get("/api/admin/role-requests");
      expect(res.status).toBe(401);
    });

    it("sin rol ADMIN → 403", async () => {
      const res = await get("/api/admin/role-requests", dancerSession);
      expect(res.status).toBe(403);
    });

    it("admin → lista PENDING y SANDBOX con person{name,email}", async () => {
      const res = await get("/api/admin/role-requests", adminSession);
      expect(res.status).toBe(200);
      const list = await res.json();
      const pending = list.find(
        (r: { id: string }) => r.id === ids.pendingRoleId,
      );
      expect(pending.status).toBe("PENDING");
      expect(pending.role).toBe("PRODUCER");
      expect(pending.person.name).toBe("Productor Pendiente Test");
      expect(pending.person.email).toBe("pending-test@omnidance.cl");
      const sandbox = list.find(
        (r: { id: string }) => r.id === ids.sandboxRoleId,
      );
      expect(sandbox.status).toBe("SANDBOX");
    });
  });

  describe("POST /api/admin/role-requests/:id/approve", () => {
    it("sin sesión → 401", async () => {
      const res = await post(
        `/api/admin/role-requests/${ids.pendingRoleId}/approve`,
        {},
      );
      expect(res.status).toBe(401);
    });

    it("sin rol ADMIN → 403", async () => {
      const res = await post(
        `/api/admin/role-requests/${ids.pendingRoleId}/approve`,
        {},
        dancerSession,
      );
      expect(res.status).toBe(403);
    });

    it("admin aprueba → status APPROVED", async () => {
      const res = await post(
        `/api/admin/role-requests/${ids.pendingRoleId}/approve`,
        {},
        adminSession,
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("APPROVED");
      const role = await prisma.personRole.findUniqueOrThrow({
        where: { id: ids.pendingRoleId },
      });
      expect(role.status).toBe("APPROVED");
    });

    it("id inexistente → 404", async () => {
      const res = await post(
        "/api/admin/role-requests/rol-fantasma/approve",
        {},
        adminSession,
      );
      expect(res.status).toBe(404);
    });
  });

  describe("POST /api/admin/role-requests/:id/reject", () => {
    it("admin rechaza → status REJECTED y el registro se preserva", async () => {
      const res = await post(
        `/api/admin/role-requests/${ids.sandboxRoleId}/reject`,
        {},
        adminSession,
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("REJECTED");
      const role = await prisma.personRole.findUniqueOrThrow({
        where: { id: ids.sandboxRoleId },
      });
      expect(role.status).toBe("REJECTED");
      // la solicitud rechazada ya no aparece en la cola
      const list = await (
        await get("/api/admin/role-requests", adminSession)
      ).json();
      expect(
        list.find((r: { id: string }) => r.id === ids.sandboxRoleId),
      ).toBeUndefined();
    });

    it("id inexistente → 404", async () => {
      const res = await post(
        "/api/admin/role-requests/rol-fantasma/reject",
        {},
        adminSession,
      );
      expect(res.status).toBe(404);
    });
  });

  describe("POST /api/roles/request", () => {
    it("sin sesión → 401", async () => {
      const res = await post("/api/roles/request", { role: "INSTRUCTOR" });
      expect(res.status).toBe(401);
    });

    it("rol inválido → 400", async () => {
      const res = await post(
        "/api/roles/request",
        { role: "SUPERUSER" },
        dancerSession,
      );
      expect(res.status).toBe(400);
    });

    it("solicitar ADMIN → 400 (nunca se auto-otorga)", async () => {
      const res = await post(
        "/api/roles/request",
        { role: "ADMIN" },
        dancerSession,
      );
      expect(res.status).toBe(400);
    });

    it("rol válido → 201 con status SANDBOX (onboarding demo)", async () => {
      const res = await post(
        "/api/roles/request",
        { role: "INSTRUCTOR" },
        dancerSession,
      );
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.status).toBe("SANDBOX");
      expect(body.role).toBe("INSTRUCTOR");
      ids.requestedRoleId = body.id;
    });

    it("misma solicitud duplicada → 409", async () => {
      const res = await post(
        "/api/roles/request",
        { role: "INSTRUCTOR" },
        dancerSession,
      );
      expect(res.status).toBe(409);
    });

    it("rechazo preserva la fila → re-solicitud del mismo rol → 409", async () => {
      const reject = await post(
        `/api/admin/role-requests/${ids.requestedRoleId}/reject`,
        {},
        adminSession,
      );
      expect(reject.status).toBe(200);
      const res = await post(
        "/api/roles/request",
        { role: "INSTRUCTOR" },
        dancerSession,
      );
      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.personRole.status).toBe("REJECTED");
    });
  });
});
