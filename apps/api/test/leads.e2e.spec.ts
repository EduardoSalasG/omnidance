import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Test } from "@nestjs/testing";
import { ValidationPipe, type INestApplication } from "@nestjs/common";
import { AuthModule } from "../src/auth/auth.module";
import { AuthService } from "../src/auth/domain/auth.service";
import { AdminModule } from "../src/admin/admin.module";
import { LeadsModule } from "../src/leads/leads.module";
import { PrismaService } from "../src/prisma.service";

describe("leads /pro e2e", () => {
  let app: INestApplication;
  let baseUrl: string;
  let prisma: PrismaService;
  const auth = new AuthService(
    process.env.JWT_SECRET ?? "dev-secret-change-me",
  );

  let adminSession: string;
  let dancerSession: string;

  const leadEmails: string[] = [];
  const personIds: string[] = [];

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
  const post = (path: string, body?: unknown, session?: string) =>
    req("POST", path, body, session);

  const validLead = (email: string, extra: Record<string, unknown> = {}) => ({
    name: "Lead Test",
    email,
    phone: "+56900000000",
    roles: ["PRODUCER"],
    intent: "CONTACT",
    ...extra,
  });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [LeadsModule, AdminModule, AuthModule],
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
      where: { roles: { some: { role: "ADMIN", status: "APPROVED" } } },
    });
    adminSession = await auth.issueSession(admin.id);

    const dancer = await prisma.person.create({
      data: {
        name: "Dancer Leads Test",
        roles: { create: [{ role: "DANCER", status: "APPROVED" }] },
      },
    });
    personIds.push(dancer.id);
    dancerSession = await auth.issueSession(dancer.id);
  });

  afterAll(async () => {
    const leads = await prisma.lead.findMany({
      where: { email: { in: leadEmails } },
      select: { id: true, personId: true },
    });
    const demoPersonIds = leads
      .map((l) => l.personId)
      .filter((x): x is string => !!x);
    await prisma.personRole.deleteMany({
      where: { personId: { in: [...personIds, ...demoPersonIds] } },
    });
    await prisma.lead.deleteMany({ where: { email: { in: leadEmails } } });
    await prisma.person.deleteMany({
      where: { id: { in: [...personIds, ...demoPersonIds] } },
    });
    await app.close();
  });

  describe("POST /api/leads", () => {
    it("lead válido → 201 con id + demoToken + accountExists:false", async () => {
      leadEmails.push("lead-e2e-1@test.cl");
      const res = await post("/api/leads", validLead("lead-e2e-1@test.cl"));
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.id).toBeTruthy();
      expect(body.demoToken).toMatch(/^[0-9a-f]{48}$/);
      expect(body.accountExists).toBe(false);

      const lead = await prisma.lead.findUniqueOrThrow({
        where: { email: "lead-e2e-1@test.cl" },
      });
      expect(lead.status).toBe("NEW");
      expect(lead.roles).toEqual(["PRODUCER"]);
      expect(lead.intent).toBe("CONTACT");
    });

    it("notifica a los ADMIN aprobados al crear lead nuevo", async () => {
      const admin = await prisma.person.findFirstOrThrow({
        where: { roles: { some: { role: "ADMIN", status: "APPROVED" } } },
      });
      const notif = await prisma.notification.findFirst({
        where: { personId: admin.id, type: "lead.new" },
        orderBy: { createdAt: "desc" },
      });
      expect(notif?.title).toContain("Lead Test");
    });

    it.each([
      ["name", { name: "" }],
      ["email", { email: "no-es-mail" }],
      ["phone", { phone: "" }],
      ["roles", { roles: [] }],
      ["roles fuera de whitelist", { roles: ["HACKER"] }],
      ["intent inválido", { intent: "HACK" }],
    ])("sin %s válido → 400", async (_label, patch) => {
      const res = await post(
        "/api/leads",
        validLead("lead-e2e-bad@test.cl", patch as Record<string, unknown>),
      );
      expect(res.status).toBe(400);
    });

    it("re-envío con el mismo email hace upsert (mismo id, datos nuevos)", async () => {
      const res = await post(
        "/api/leads",
        validLead("lead-e2e-1@test.cl", {
          name: "Lead Test Actualizado",
          roles: ["DJ", "ACADEMY_OWNER"],
          intent: "DEMO",
        }),
      );
      expect(res.status).toBe(201);
      const lead = await prisma.lead.findUniqueOrThrow({
        where: { email: "lead-e2e-1@test.cl" },
      });
      expect(lead.name).toBe("Lead Test Actualizado");
      expect(lead.roles).toEqual(["DJ", "ACADEMY_OWNER"]);
      expect(lead.intent).toBe("DEMO");
    });

    it("email de cuenta existente → accountExists:true y sin demoToken", async () => {
      const existing = await prisma.person.findFirstOrThrow({
        where: { email: "admin@omnidance.dev" },
        select: { email: true },
      });
      const res = await post("/api/leads", validLead(existing.email!));
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.accountExists).toBe(true);
      expect(body.demoToken).toBeNull();
      await prisma.lead.delete({ where: { email: existing.email! } });
    });
  });

  describe("POST /api/leads/:id/demo", () => {
    it("sin token → 404 (el id solo no es credencial)", async () => {
      const lead = await prisma.lead.findUniqueOrThrow({
        where: { email: "lead-e2e-1@test.cl" },
      });
      const res = await post(`/api/leads/${lead.id}/demo`, {});
      expect(res.status).toBe(404);
    });

    it("token incorrecto → 404", async () => {
      const lead = await prisma.lead.findUniqueOrThrow({
        where: { email: "lead-e2e-1@test.cl" },
      });
      const res = await post(`/api/leads/${lead.id}/demo`, {
        token: "0".repeat(48),
      });
      expect(res.status).toBe(404);
    });

    it("lead inexistente → 404", async () => {
      const res = await post("/api/leads/no-existe/demo", {
        token: "0".repeat(48),
      });
      expect(res.status).toBe(404);
    });

    it("token válido → 200, crea persona demo con roles y enlaza el lead", async () => {
      const lead = await prisma.lead.findUniqueOrThrow({
        where: { email: "lead-e2e-1@test.cl" },
      });
      const res = await post(`/api/leads/${lead.id}/demo`, {
        token: lead.demoToken,
      });
      expect(res.status).toBe(200);
      expect(res.headers.get("set-cookie")).toContain("omnidance_session=");

      const updated = await prisma.lead.findUniqueOrThrow({
        where: { id: lead.id },
      });
      expect(updated.status).toBe("CONVERTED");
      expect(updated.personId).toBeTruthy();

      const person = await prisma.person.findUniqueOrThrow({
        where: { id: updated.personId! },
        include: { roles: true },
      });
      expect(person.email).toBe("lead-e2e-1@test.cl");
      expect(person.isDemoAccount).toBe(true);
      expect(person.verifiedAt).toBeNull();
      expect(person.roles.map((r) => `${r.role}:${r.status}`).sort()).toEqual([
        "ACADEMY_OWNER:APPROVED",
        "DJ:APPROVED",
      ]);
    });

    it("re-entrar con el mismo token reemite sesión (no duplica persona)", async () => {
      const lead = await prisma.lead.findUniqueOrThrow({
        where: { email: "lead-e2e-1@test.cl" },
      });
      const res = await post(`/api/leads/${lead.id}/demo`, {
        token: lead.demoToken,
      });
      expect(res.status).toBe(200);
      const after = await prisma.lead.findUniqueOrThrow({
        where: { id: lead.id },
      });
      expect(after.personId).toBe(lead.personId);
    });

    it("email ya registrado como persona → 409 account_exists", async () => {
      // Lead creado antes de que existiera la persona: el demo choca.
      const person = await prisma.person.create({
        data: { name: "Colision Test", email: "lead-e2e-col@test.cl" },
      });
      personIds.push(person.id);
      leadEmails.push("lead-e2e-col@test.cl");
      const lead = await prisma.lead.create({
        data: {
          name: "Lead Colisión",
          email: "lead-e2e-col@test.cl",
          phone: "+569",
          roles: ["DJ"],
          intent: "DEMO",
          demoToken: "a".repeat(48),
        },
      });
      const res = await post(`/api/leads/${lead.id}/demo`, {
        token: lead.demoToken,
      });
      expect(res.status).toBe(409);
      const refreshed = await prisma.lead.findUniqueOrThrow({
        where: { id: lead.id },
      });
      expect(refreshed.personId).toBeNull();
    });
  });

  describe("GET /api/admin/browse/leads", () => {
    it("sin sesión → 401", async () => {
      const res = await get("/api/admin/browse/leads");
      expect(res.status).toBe(401);
    });

    it("sin rol ADMIN → 403", async () => {
      const res = await get("/api/admin/browse/leads", dancerSession);
      expect(res.status).toBe(403);
    });

    it("admin lista leads y filtra por intent/status/q", async () => {
      const res = await get("/api/admin/browse/leads", adminSession);
      expect(res.status).toBe(200);
      const rows = await res.json();
      const mine = rows.find(
        (r: { email: string }) => r.email === "lead-e2e-1@test.cl",
      );
      expect(mine).toBeTruthy();
      expect(mine.status).toBe("CONVERTED");
      expect(mine.demoToken).toBeUndefined(); // nunca exponer el token

      const filtered = await get(
        "/api/admin/browse/leads?intent=DEMO&status=CONVERTED&q=lead-e2e",
        adminSession,
      );
      expect(filtered.status).toBe(200);
      const filteredRows = await filtered.json();
      expect(filteredRows.length).toBeGreaterThanOrEqual(1);
      expect(
        filteredRows.every(
          (r: { intent: string; status: string }) =>
            r.intent === "DEMO" && r.status === "CONVERTED",
        ),
      ).toBe(true);
    });

    it("intent fuera de whitelist → 400", async () => {
      const res = await get(
        "/api/admin/browse/leads?intent=HACK",
        adminSession,
      );
      expect(res.status).toBe(400);
    });
  });
});
