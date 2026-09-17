import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Test } from "@nestjs/testing";
import { ValidationPipe, type INestApplication } from "@nestjs/common";
import { AuthModule } from "../src/auth/auth.module";
import { AuthService } from "../src/auth/domain/auth.service";
import { AcademiesModule } from "../src/academies/academies.module";
import { PrismaService } from "../src/prisma.service";

describe("academies e2e", () => {
  let app: INestApplication;
  let baseUrl: string;
  let prisma: PrismaService;
  const auth = new AuthService(
    process.env.JWT_SECRET ?? "dev-secret-change-me",
  );

  let ownerSession: string;
  let instructorSession: string;
  let outsiderSession: string;
  let adminSession: string;

  const ids = {
    ownerId: "",
    instructorId: "",
    studentId: "",
    outsiderId: "",
    academyId: "",
    planId: "",
    enrollmentId: "",
    slotId: "",
    createdAcademyId: "",
  };
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
        "content-type": "application/json",
        ...(session ? { cookie: `omnidance_session=${session}` } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  const get = (path: string, session?: string) => req("GET", path, undefined, session);
  const post = (path: string, body: unknown, session?: string) =>
    req("POST", path, body, session);
  const patch = (path: string, body: unknown, session?: string) =>
    req("PATCH", path, body, session);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AcademiesModule, AuthModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api");
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    await app.listen(0);
    prisma = app.get(PrismaService);
    const address = app.getHttpServer().address();
    baseUrl = `http://127.0.0.1:${address.port}`;

    // ─── datos de prueba ───
    const mkPerson = (name: string, roles: { role: "DANCER" | "ACADEMY_OWNER" | "INSTRUCTOR"; status: "APPROVED" | "SANDBOX" }[]) =>
      prisma.person
        .create({ data: { name, roles: { create: roles } } })
        .then((p) => {
          createdPersonIds.push(p.id);
          return p;
        });

    const owner = await mkPerson("Owner Academia Test", [
      { role: "ACADEMY_OWNER", status: "APPROVED" },
    ]);
    ids.ownerId = owner.id;
    ownerSession = await auth.issueSession(owner.id);

    const instructor = await mkPerson("Instructor Academia Test", [
      { role: "INSTRUCTOR", status: "APPROVED" },
    ]);
    ids.instructorId = instructor.id;
    instructorSession = await auth.issueSession(instructor.id);

    const student = await mkPerson("Alumno Academia Test", [
      { role: "DANCER", status: "APPROVED" },
    ]);
    ids.studentId = student.id;

    const outsider = await mkPerson("Bailarín Ajeno Test", [
      { role: "DANCER", status: "APPROVED" },
    ]);
    ids.outsiderId = outsider.id;
    outsiderSession = await auth.issueSession(outsider.id);

    const admin = await prisma.person.findFirstOrThrow({
      where: { email: "admin@omnidance.dev" },
    });
    adminSession = await auth.issueSession(admin.id);

    const academy = await prisma.academy.create({
      data: { name: "Academia Test", ownerId: owner.id },
    });
    ids.academyId = academy.id;

    await prisma.academyInstructor.create({
      data: { academyId: academy.id, personId: instructor.id },
    });
  });

  afterAll(async () => {
    await prisma.attendance.deleteMany({
      where: { class: { slot: { academyId: { in: [ids.academyId, ids.createdAcademyId].filter(Boolean) } } } },
    });
    await prisma.class.deleteMany({
      where: { slot: { academyId: { in: [ids.academyId, ids.createdAcademyId].filter(Boolean) } } },
    });
    await prisma.classSlot.deleteMany({
      where: { academyId: { in: [ids.academyId, ids.createdAcademyId].filter(Boolean) } },
    });
    await prisma.enrollment.deleteMany({
      where: { academyId: { in: [ids.academyId, ids.createdAcademyId].filter(Boolean) } },
    });
    await prisma.membershipPlan.deleteMany({
      where: { academyId: { in: [ids.academyId, ids.createdAcademyId].filter(Boolean) } },
    });
    await prisma.academyInstructor.deleteMany({
      where: { academyId: { in: [ids.academyId, ids.createdAcademyId].filter(Boolean) } },
    });
    await prisma.academy.deleteMany({
      where: { id: { in: [ids.academyId, ids.createdAcademyId].filter(Boolean) } },
    });
    await prisma.personRole.deleteMany({
      where: { personId: { in: createdPersonIds } },
    });
    await prisma.person.deleteMany({ where: { id: { in: createdPersonIds } } });
    await app.close();
  });

  describe("GET /api/academies/mine", () => {
    it("sin sesión → 401", async () => {
      const res = await get("/api/academies/mine");
      expect(res.status).toBe(401);
    });

    it("owner ve su academia", async () => {
      const res = await get("/api/academies/mine", ownerSession);
      expect(res.status).toBe(200);
      const list = await res.json();
      expect(list.some((a: { id: string }) => a.id === ids.academyId)).toBe(true);
    });

    it("instructor ve la academia donde enseña", async () => {
      const res = await get("/api/academies/mine", instructorSession);
      expect(res.status).toBe(200);
      const list = await res.json();
      expect(list.some((a: { id: string }) => a.id === ids.academyId)).toBe(true);
    });

    it("outsider ve lista vacía", async () => {
      const res = await get("/api/academies/mine", outsiderSession);
      expect(res.status).toBe(200);
      const list = await res.json();
      expect(list.some((a: { id: string }) => a.id === ids.academyId)).toBe(false);
    });
  });

  describe("POST /api/academies", () => {
    it("sin sesión → 401", async () => {
      const res = await post("/api/academies", { name: "X" });
      expect(res.status).toBe(401);
    });

    it("sin rol ACADEMY_OWNER → 403", async () => {
      const res = await post("/api/academies", { name: "X" }, outsiderSession);
      expect(res.status).toBe(403);
    });

    it("owner crea academia → 201 con ownerId", async () => {
      const res = await post(
        "/api/academies",
        { name: "Academia Nueva Test" },
        ownerSession,
      );
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.name).toBe("Academia Nueva Test");
      expect(body.ownerId).toBe(ids.ownerId);
      ids.createdAcademyId = body.id;
    });
  });

  describe("GET /api/academies/:id", () => {
    it("sin sesión → 401", async () => {
      const res = await get(`/api/academies/${ids.academyId}`);
      expect(res.status).toBe(401);
    });

    it("outsider → 403", async () => {
      const res = await get(`/api/academies/${ids.academyId}`, outsiderSession);
      expect(res.status).toBe(403);
    });

    it("instructor → 200 con stats", async () => {
      const res = await get(`/api/academies/${ids.academyId}`, instructorSession);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.id).toBe(ids.academyId);
      expect(body.stats).toMatchObject({
        activeStudents: expect.any(Number),
        plansCount: expect.any(Number),
        slotsCount: expect.any(Number),
      });
    });

    it("academia inexistente → 404", async () => {
      const res = await get("/api/academies/academia-fantasma", ownerSession);
      expect(res.status).toBe(404);
    });
  });

  describe("planes", () => {
    it("POST /api/academies/:id/plans owner → 201", async () => {
      const res = await post(
        `/api/academies/${ids.academyId}/plans`,
        { name: "Mensual 8 clases", type: "MONTHLY", price: 45000, classesPerPeriod: 8 },
        ownerSession,
      );
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.academyId).toBe(ids.academyId);
      expect(body.classCount).toBe(8);
      ids.planId = body.id;
    });

    it("POST plan por instructor → 403", async () => {
      const res = await post(
        `/api/academies/${ids.academyId}/plans`,
        { name: "X", type: "MONTHLY", price: 1 },
        instructorSession,
      );
      expect(res.status).toBe(403);
    });

    it("POST plan por outsider → 403", async () => {
      const res = await post(
        `/api/academies/${ids.academyId}/plans`,
        { name: "X", type: "MONTHLY", price: 1 },
        outsiderSession,
      );
      expect(res.status).toBe(403);
    });

    it("GET /api/academies/:id/plans owner → lista", async () => {
      const res = await get(`/api/academies/${ids.academyId}/plans`, ownerSession);
      expect(res.status).toBe(200);
      const list = await res.json();
      expect(list.some((p: { id: string }) => p.id === ids.planId)).toBe(true);
    });
  });

  describe("enrollments", () => {
    it("POST enrollment owner → 201 ACTIVE por defecto", async () => {
      const res = await post(
        `/api/academies/${ids.academyId}/enrollments`,
        { personId: ids.studentId, planId: ids.planId },
        ownerSession,
      );
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.status).toBe("ACTIVE");
      expect(body.personId).toBe(ids.studentId);
      ids.enrollmentId = body.id;
    });

    it("POST enrollment duplicado ACTIVE mismo plan → 409", async () => {
      const res = await post(
        `/api/academies/${ids.academyId}/enrollments`,
        { personId: ids.studentId, planId: ids.planId },
        ownerSession,
      );
      expect(res.status).toBe(409);
    });

    it("POST enrollment persona inexistente → 404", async () => {
      const res = await post(
        `/api/academies/${ids.academyId}/enrollments`,
        { personId: "persona-fantasma", planId: ids.planId },
        ownerSession,
      );
      expect(res.status).toBe(404);
    });

    it("POST enrollment plan de otra academia → 404", async () => {
      const res = await post(
        `/api/academies/${ids.academyId}/enrollments`,
        { personId: ids.outsiderId, planId: "plan-fantasma" },
        ownerSession,
      );
      expect(res.status).toBe(404);
    });

    it("PATCH /api/enrollments/:id ACTIVE → PAUSED → 200", async () => {
      const res = await patch(
        `/api/enrollments/${ids.enrollmentId}`,
        { status: "PAUSED" },
        ownerSession,
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("PAUSED");
      expect(body.pausedAt).toBeTruthy();
    });

    it("PATCH transición inválida PAUSED → TRIAL → 400", async () => {
      const res = await patch(
        `/api/enrollments/${ids.enrollmentId}`,
        { status: "TRIAL" },
        ownerSession,
      );
      expect(res.status).toBe(400);
    });

    it("PATCH por outsider → 403", async () => {
      const res = await patch(
        `/api/enrollments/${ids.enrollmentId}`,
        { status: "ACTIVE" },
        outsiderSession,
      );
      expect(res.status).toBe(403);
    });

    it("PATCH por admin → 200", async () => {
      const res = await patch(
        `/api/enrollments/${ids.enrollmentId}`,
        { status: "ACTIVE" },
        adminSession,
      );
      expect(res.status).toBe(200);
    });

    it("GET /api/academies/:id/students → lista con person y plan", async () => {
      const res = await get(
        `/api/academies/${ids.academyId}/students`,
        ownerSession,
      );
      expect(res.status).toBe(200);
      const list = await res.json();
      const enr = list.find(
        (e: { id: string }) => e.id === ids.enrollmentId,
      );
      expect(enr.person.id).toBe(ids.studentId);
      expect(enr.person.name).toBe("Alumno Academia Test");
      expect(enr.plan.name).toBe("Mensual 8 clases");
      expect(enr.status).toBe("ACTIVE");
    });
  });

  describe("slots", () => {
    it("POST slot owner → 201", async () => {
      const res = await post(
        `/api/academies/${ids.academyId}/slots`,
        {
          dayOfWeek: 2,
          startTime: "19:00",
          endTime: "20:30",
          instructorId: ids.instructorId,
          capacity: 20,
        },
        ownerSession,
      );
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.weekday).toBe(2);
      expect(body.academyId).toBe(ids.academyId);
      ids.slotId = body.id;
    });

    it("POST slot weekday inválido → 400", async () => {
      const res = await post(
        `/api/academies/${ids.academyId}/slots`,
        { dayOfWeek: 9, startTime: "19:00", endTime: "20:00", capacity: 10 },
        ownerSession,
      );
      expect(res.status).toBe(400);
    });

    it("GET slots owner → lista", async () => {
      const res = await get(`/api/academies/${ids.academyId}/slots`, ownerSession);
      expect(res.status).toBe(200);
      const list = await res.json();
      expect(list.some((s: { id: string }) => s.id === ids.slotId)).toBe(true);
    });
  });

  describe("attendance", () => {
    it("POST asistencia owner → 201", async () => {
      const res = await post(
        `/api/academies/${ids.academyId}/attendance`,
        { slotId: ids.slotId, personId: ids.studentId, date: "2025-06-03" },
        ownerSession,
      );
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.personId).toBe(ids.studentId);
    });

    it("POST asistencia instructor → 201", async () => {
      const res = await post(
        `/api/academies/${ids.academyId}/attendance`,
        { slotId: ids.slotId, personId: ids.outsiderId, date: "2025-06-03" },
        instructorSession,
      );
      expect(res.status).toBe(201);
    });

    it("POST asistencia duplicada mismo slot+persona+fecha → 409", async () => {
      const res = await post(
        `/api/academies/${ids.academyId}/attendance`,
        { slotId: ids.slotId, personId: ids.studentId, date: "2025-06-03" },
        ownerSession,
      );
      expect(res.status).toBe(409);
    });

    it("POST asistencia outsider → 403", async () => {
      const res = await post(
        `/api/academies/${ids.academyId}/attendance`,
        { slotId: ids.slotId, personId: ids.studentId },
        outsiderSession,
      );
      expect(res.status).toBe(403);
    });

    it("POST asistencia slot de otra academia → 404", async () => {
      const res = await post(
        `/api/academies/${ids.academyId}/attendance`,
        { slotId: "slot-fantasma", personId: ids.studentId },
        ownerSession,
      );
      expect(res.status).toBe(404);
    });

    it("POST asistencia sin fecha → 201 usa la fecha de hoy", async () => {
      const res = await post(
        `/api/academies/${ids.academyId}/attendance`,
        { slotId: ids.slotId, personId: ids.ownerId },
        ownerSession,
      );
      expect(res.status).toBe(201);
    });

    it("GET attendance owner → registros del rango con join de person", async () => {
      const res = await get(
        `/api/academies/${ids.academyId}/attendance?from=2025-06-01&to=2025-06-30`,
        ownerSession,
      );
      expect(res.status).toBe(200);
      const list = await res.json();
      expect(list.length).toBeGreaterThanOrEqual(2);
      const row = list.find(
        (a: { personId: string }) => a.personId === ids.studentId,
      );
      expect(row).toBeTruthy();
      expect(row.person).toMatchObject({
        id: ids.studentId,
        name: "Alumno Academia Test",
      });
    });

    it("GET attendance instructor → 403 (solo owner/admin)", async () => {
      const res = await get(
        `/api/academies/${ids.academyId}/attendance`,
        instructorSession,
      );
      expect(res.status).toBe(403);
    });
  });

  describe("GET /api/academies/:id/dashboard", () => {
    it("owner → KPIs", async () => {
      const res = await get(
        `/api/academies/${ids.academyId}/dashboard`,
        ownerSession,
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.studentsByStatus.active).toBe(1);
      expect(body.totalStudents).toBe(1);
      expect(body.plansCount).toBe(1);
      expect(body.attendanceLast30d).toBeGreaterThanOrEqual(1); // la de hoy
    });

    it("outsider → 403", async () => {
      const res = await get(
        `/api/academies/${ids.academyId}/dashboard`,
        outsiderSession,
      );
      expect(res.status).toBe(403);
    });
  });
});
