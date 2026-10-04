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
  let studentSession: string;

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
    studentSession = await auth.issueSession(student.id);

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
    await prisma.classBooking.deleteMany({
      where: { class: { slot: { academyId: { in: [ids.academyId, ids.createdAcademyId].filter(Boolean) } } } },
    });
    await prisma.class.deleteMany({
      where: { slot: { academyId: { in: [ids.academyId, ids.createdAcademyId].filter(Boolean) } } },
    });
    await prisma.classSlot.deleteMany({
      where: { academyId: { in: [ids.academyId, ids.createdAcademyId].filter(Boolean) } },
    });
    await prisma.classSeries.deleteMany({
      where: { academyId: { in: [ids.academyId, ids.createdAcademyId].filter(Boolean) } },
    });
    await prisma.enrollment.deleteMany({
      where: { academyId: { in: [ids.academyId, ids.createdAcademyId].filter(Boolean) } },
    });
    await prisma.membershipPlan.deleteMany({
      where: { academyId: { in: [ids.academyId, ids.createdAcademyId].filter(Boolean) } },
    });
    // Suscripciones SaaS (POST /:id/subscribe crea una PENDING_CARD):
    // FK a Academy y Person — antes de borrar ambas.
    await prisma.platformSubscription.deleteMany({
      where: {
        OR: [
          {
            academyId: {
              in: [ids.academyId, ids.createdAcademyId].filter(Boolean),
            },
          },
          { personId: { in: createdPersonIds } },
        ],
      },
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

    it("PATCH plan owner → 200 actualiza precio/descripcion/active", async () => {
      const res = await patch(
        `/api/academies/${ids.academyId}/plans/${ids.planId}`,
        {
          price: 46000,
          description: ["Acceso a todas las sedes"],
          active: true,
        },
        ownerSession,
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.name).toBe("Mensual 8 clases"); // sin tocar
      expect(body.price).toBe(46000);
      expect(body.description).toEqual(["Acceso a todas las sedes"]);
    });

    it("PATCH plan por outsider → 403", async () => {
      const res = await patch(
        `/api/academies/${ids.academyId}/plans/${ids.planId}`,
        { price: 1 },
        outsiderSession,
      );
      expect(res.status).toBe(403);
    });

    it("PATCH plan de otra academia → 404", async () => {
      const res = await patch(
        `/api/academies/${ids.academyId}/plans/plan-fantasma`,
        { price: 1 },
        ownerSession,
      );
      expect(res.status).toBe(404);
    });

    it("PATCH cambiar type con espejo Flow → 400", async () => {
      // El espejo se materializa en el primer subscribe; lo simulamos
      // directo — con gateway stub el sync es no-op, lo que se valida
      // acá es el lock de tipo.
      await prisma.membershipPlan.update({
        where: { id: ids.planId },
        data: { flowPlanId: "omni_test" },
      });
      const res = await patch(
        `/api/academies/${ids.academyId}/plans/${ids.planId}`,
        { type: "SINGLE" },
        ownerSession,
      );
      expect(res.status).toBe(400);
      // Mismo type pasa el lock; flowPlanId queda (el settle no lo toca).
      const same = await patch(
        `/api/academies/${ids.academyId}/plans/${ids.planId}`,
        { type: "MONTHLY", price: 46000 },
        ownerSession,
      );
      expect(same.status).toBe(200);
      await prisma.membershipPlan.update({
        where: { id: ids.planId },
        data: { flowPlanId: null },
      });
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
    // Los slots solo existen dentro de una serie — el endpoint standalone
    // POST /academies/:id/slots fue eliminado con el invariante de schema.
    it("POST series owner → crea serie + slots", async () => {
      const res = await post(
        `/api/academies/${ids.academyId}/series`,
        {
          name: "Serie Test",
          month: "2025-06",
          slots: [
            {
              weekday: 2,
              startTime: "19:00",
              endTime: "20:30",
              instructorId: ids.instructorId,
              capacity: 20,
            },
          ],
        },
        ownerSession,
      );
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.slots[0].weekday).toBe(2);
      expect(body.slots[0].seriesId).toBe(body.id);
      ids.slotId = body.slots[0].id;
    });

    it("POST slot standalone → ya no existe", async () => {
      const res = await post(
        `/api/academies/${ids.academyId}/slots`,
        { dayOfWeek: 2, startTime: "19:00", endTime: "20:00", capacity: 10 },
        ownerSession,
      );
      expect(res.status).toBe(404);
    });

    it("GET slots owner → lista con serie", async () => {
      const res = await get(`/api/academies/${ids.academyId}/slots`, ownerSession);
      expect(res.status).toBe(200);
      const list = await res.json();
      const slot = list.find((s: { id: string }) => s.id === ids.slotId);
      expect(slot).toBeTruthy();
      expect(slot.series.name).toBe("Serie Test");
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

  describe("vista alumno (learner)", () => {
    const dayAt = (daysAgo: number) => {
      const d = new Date(Date.now() - daysAgo * 86_400_000);
      d.setUTCHours(0, 0, 0, 0);
      return d;
    };
    let attendedClassId: string;
    let bookedClassId: string;
    let cancelledClassId: string;

    beforeAll(async () => {
      // Clases pasadas del slot del alumno: una asistida, una solo
      // reservada y una cancelada — las tres ramas del historial.
      const attended = await prisma.class.create({
        data: { classSlotId: ids.slotId, date: dayAt(3) },
      });
      attendedClassId = attended.id;
      await prisma.attendance.create({
        data: { classId: attended.id, personId: ids.studentId },
      });
      const booked = await prisma.class.create({
        data: { classSlotId: ids.slotId, date: dayAt(10) },
      });
      bookedClassId = booked.id;
      await prisma.classBooking.create({
        data: { classId: booked.id, personId: ids.studentId },
      });
      const cancelled = await prisma.class.create({
        data: { classSlotId: ids.slotId, date: dayAt(17) },
      });
      cancelledClassId = cancelled.id;
      await prisma.classBooking.create({
        data: {
          classId: cancelled.id,
          personId: ids.studentId,
          status: "CANCELLED",
        },
      });
    });

    describe("GET /api/academies/enrolled", () => {
      it("sin sesión → 401", async () => {
        const res = await get("/api/academies/enrolled");
        expect(res.status).toBe(401);
      });

      it("alumno ve su inscripción con academia, plan y attendance30d", async () => {
        const res = await get("/api/academies/enrolled", studentSession);
        expect(res.status).toBe(200);
        const list = await res.json();
        const enr = list.find(
          (e: { academy: { id: string } }) => e.academy.id === ids.academyId,
        );
        expect(enr).toBeTruthy();
        expect(enr.academy.name).toBe("Academia Test");
        expect(enr.status).toBe("ACTIVE");
        expect(enr.plan.name).toBe("Mensual 8 clases");
        expect(enr.attendance30d).toBeGreaterThanOrEqual(1); // la de hace 3 días
      });

      it("outsider sin inscripciones → []", async () => {
        const res = await get("/api/academies/enrolled", outsiderSession);
        expect(res.status).toBe(200);
        const list = await res.json();
        expect(
          list.every(
            (e: { academy: { id: string } }) => e.academy.id !== ids.academyId,
          ),
        ).toBe(true);
      });
    });

    describe("GET /api/classes/mine?scope=past", () => {
      it("sin sesión → 401", async () => {
        const res = await get("/api/classes/mine?scope=past");
        expect(res.status).toBe(401);
      });

      it("historial deduplica por clase: attended prevalece sobre cancelación", async () => {
        const res = await get("/api/classes/mine?scope=past", studentSession);
        expect(res.status).toBe(200);
        const list = await res.json();
        const byId = new Map(
          list.map((r: { id: string }) => [r.id, r]),
        );
        expect(byId.get(attendedClassId)).toMatchObject({
          status: "attended",
        });
        // Una reserva pasada sin asistencia no es historial (solo
        // attended/cancelled — semántica desde 2d2eff5).
        expect(byId.get(bookedClassId)).toBeUndefined();
        expect(byId.get(cancelledClassId)).toMatchObject({
          status: "cancelled",
        });
      });

      it("orden descendente por fecha y sin clases futuras", async () => {
        const res = await get("/api/classes/mine?scope=past", studentSession);
        const list = await res.json();
        const dates = list.map((r: { date: string }) =>
          new Date(r.date).getTime(),
        );
        expect([...dates].sort((a, b) => b - a)).toEqual(dates);
        for (const d of dates) expect(d).toBeLessThan(Date.now());
      });

      it("sin scope sigue devolviendo solo reservas futuras", async () => {
        const res = await get("/api/classes/mine", studentSession);
        expect(res.status).toBe(200);
        const list = await res.json();
        expect(
          list.every(
            (r: { id: string }) =>
              ![attendedClassId, bookedClassId, cancelledClassId].includes(
                r.id,
              ),
          ),
        ).toBe(true);
      });
    });

    describe("browse por inscripción + gate de reserva", () => {
      let futureClassId: string;

      beforeAll(async () => {
        // Clase futura materializada del slot del alumno.
        const future = await prisma.class.create({
          data: {
            classSlotId: ids.slotId,
            date: new Date(Date.now() + 5 * 86_400_000),
          },
        });
        futureClassId = future.id;
      });

      it("scope=enrolled del alumno incluye su academia con enrolled:true", async () => {
        const res = await get(
          "/api/classes/browse?scope=enrolled&days=30",
          studentSession,
        );
        expect(res.status).toBe(200);
        const list = await res.json();
        const cls = list.find(
          (c: { id: string }) => c.id === futureClassId,
        );
        expect(cls).toBeTruthy();
        expect(cls.enrolled).toBe(true);
        // Todo lo listado es de academias con inscripción vigente.
        expect(list.every((c: { enrolled: boolean }) => c.enrolled)).toBe(
          true,
        );
      });

      it("scope=enrolled del outsider no incluye la academia ajena", async () => {
        const res = await get(
          "/api/classes/browse?scope=enrolled&days=30",
          outsiderSession,
        );
        expect(res.status).toBe(200);
        const list = await res.json();
        expect(
          list.some((c: { id: string }) => c.id === futureClassId),
        ).toBe(false);
      });

      it("browse sin scope lista todas las academias con enrolled:false", async () => {
        const res = await get(
          "/api/classes/browse?days=30",
          outsiderSession,
        );
        expect(res.status).toBe(200);
        const list = await res.json();
        const cls = list.find(
          (c: { id: string }) => c.id === futureClassId,
        );
        expect(cls).toBeTruthy();
        expect(cls.enrolled).toBe(false);
      });

      it("detail informa enrolled según inscripción del visitante", async () => {
        const asStudent = await get(
          `/api/classes/${futureClassId}`,
          studentSession,
        );
        expect((await asStudent.json()).enrolled).toBe(true);
        const asOutsider = await get(
          `/api/classes/${futureClassId}`,
          outsiderSession,
        );
        expect((await asOutsider.json()).enrolled).toBe(false);
      });

      it("book sin inscripción vigente → 403 y no crea reserva", async () => {
        const res = await post(
          `/api/classes/${futureClassId}/book`,
          {},
          outsiderSession,
        );
        expect(res.status).toBe(403);
      });

      it("book con inscripción ACTIVE → 201 BOOKED", async () => {
        const res = await post(
          `/api/classes/${futureClassId}/book`,
          {},
          studentSession,
        );
        expect(res.status).toBe(201);
        const body = await res.json();
        expect(body.status).toBe("BOOKED");
      });
    });

    /**
     * Enforcement de mora (spec academy-saas-billing, S3): con
     * `billingBlockedAt` seteado la consola queda read-only (403
     * billing.blocked en mutaciones, GETs abiertos), la academia sale
     * de exploración (directorio/browse/landing) y las compras nuevas
     * del alumno rechazan con 400 academy.unavailable — pero el alumno
     * conserva su historial e inscripción, y el owner conserva los
     * endpoints de billing para pagar y desbloquearse.
     */
    describe("academia bloqueada por mora (S3)", () => {
      let blockedClassId: string;

      beforeAll(async () => {
        const cls = await prisma.class.create({
          data: {
            classSlotId: ids.slotId,
            date: new Date(Date.now() + 6 * 86_400_000),
          },
        });
        blockedClassId = cls.id;
        await prisma.academy.update({
          where: { id: ids.academyId },
          data: { billingBlockedAt: new Date() },
        });
      });

      afterAll(async () => {
        await prisma.academy.update({
          where: { id: ids.academyId },
          data: { billingBlockedAt: null, billingGraceUntil: null },
        });
      });

      // ─── exploración ───

      it("GET /academies (directorio) la excluye", async () => {
        const res = await get("/api/academies", outsiderSession);
        expect(res.status).toBe(200);
        const list = await res.json();
        expect(
          list.some((a: { id: string }) => a.id === ids.academyId),
        ).toBe(false);
      });

      it("GET /academies/:id/profile → 200 con billingBlocked:true", async () => {
        const res = await get(
          `/api/academies/${ids.academyId}/profile`,
          outsiderSession,
        );
        expect(res.status).toBe(200);
        expect((await res.json()).billingBlocked).toBe(true);
      });

      it("GET /classes/browse la excluye (scope global y enrolled)", async () => {
        const global = await get("/api/classes/browse?days=30", outsiderSession);
        expect(
          (await global.json()).some(
            (c: { id: string }) => c.id === blockedClassId,
          ),
        ).toBe(false);
        const enrolled = await get(
          "/api/classes/browse?scope=enrolled&days=30",
          studentSession,
        );
        expect(
          (await enrolled.json()).some(
            (c: { id: string }) => c.id === blockedClassId,
          ),
        ).toBe(false);
      });

      // ─── preservación del alumno ───

      it("GET /academies/enrolled la sigue listando con billingBlocked:true", async () => {
        const res = await get("/api/academies/enrolled", studentSession);
        expect(res.status).toBe(200);
        const enr = (await res.json()).find(
          (e: { academy: { id: string } }) => e.academy.id === ids.academyId,
        );
        expect(enr).toBeTruthy();
        expect(enr.academy.billingBlocked).toBe(true);
      });

      it("GET /classes/mine conserva historial y reservas vigentes con flag", async () => {
        const past = await get("/api/classes/mine?scope=past", studentSession);
        expect(past.status).toBe(200);
        const pastList = await past.json();
        const attended = pastList.find(
          (r: { id: string }) => r.id === attendedClassId,
        );
        expect(attended).toBeTruthy();
        expect(attended.academy.billingBlocked).toBe(true);

        const mine = await get("/api/classes/mine", studentSession);
        const upcoming = (await mine.json()).find(
          (r: { academy: { id: string } }) => r.academy.id === ids.academyId,
        );
        expect(upcoming).toBeTruthy(); // su BOOKED de la clase futura
        expect(upcoming.academy.billingBlocked).toBe(true);
      });

      it("POST /classes/:id/book → 400 academy.unavailable", async () => {
        const res = await post(
          `/api/classes/${blockedClassId}/book`,
          {},
          studentSession,
        );
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toBe("academy.unavailable");
        expect(body.message).toContain("no está disponible");
      });

      // ─── consola read-only ───

      it("GETs de consola siguen abiertos (detalle + dashboard)", async () => {
        const det = await get(`/api/academies/${ids.academyId}`, ownerSession);
        expect(det.status).toBe(200);
        const dash = await get(
          `/api/academies/${ids.academyId}/dashboard`,
          ownerSession,
        );
        expect(dash.status).toBe(200);
      });

      it("PATCH settings → 403 {error:'billing.blocked'}", async () => {
        const res = await patch(
          `/api/academies/${ids.academyId}/settings`,
          { description: "intento" },
          ownerSession,
        );
        expect(res.status).toBe(403);
        expect((await res.json()).error).toBe("billing.blocked");
      });

      it("POST plans → 403 billing.blocked", async () => {
        const res = await post(
          `/api/academies/${ids.academyId}/plans`,
          { name: "X", type: "MONTHLY", price: 1 },
          ownerSession,
        );
        expect(res.status).toBe(403);
        expect((await res.json()).error).toBe("billing.blocked");
      });

      it("POST series → 403 billing.blocked", async () => {
        const res = await post(
          `/api/academies/${ids.academyId}/series`,
          {
            name: "Serie Bloqueada",
            month: "2025-07",
            slots: [{ weekday: 3, startTime: "19:00", endTime: "20:00" }],
          },
          ownerSession,
        );
        expect(res.status).toBe(403);
        expect((await res.json()).error).toBe("billing.blocked");
      });

      it("POST attendance → 403 (owner e instructor quedan read-only)", async () => {
        for (const session of [ownerSession, instructorSession]) {
          const res = await post(
            `/api/academies/${ids.academyId}/attendance`,
            { slotId: ids.slotId, personId: ids.studentId },
            session,
          );
          expect(res.status).toBe(403);
          expect((await res.json()).error).toBe("billing.blocked");
        }
      });

      it("PATCH /enrollments/:id → 403 billing.blocked", async () => {
        const res = await patch(
          `/api/enrollments/${ids.enrollmentId}`,
          { status: "PAUSED" },
          ownerSession,
        );
        expect(res.status).toBe(403);
        expect((await res.json()).error).toBe("billing.blocked");
      });

      it("POST videos → 403 billing.blocked", async () => {
        const res = await post(
          `/api/academies/${ids.academyId}/videos`,
          { url: "https://youtube.com/watch?v=x", title: "Clase" },
          ownerSession,
        );
        expect(res.status).toBe(403);
        expect((await res.json()).error).toBe("billing.blocked");
      });

      // ─── billing sigue abierto (el owner paga para desbloquearse) ───

      it("GET /academies/:id/billing → 200 para el owner bloqueado", async () => {
        const res = await get(
          `/api/academies/${ids.academyId}/billing`,
          ownerSession,
        );
        expect(res.status).toBe(200);
        expect((await res.json()).blocked).toBe(true);
      });

      it("POST /academies/:id/subscribe no da 403 billing.blocked", async () => {
        const res = await post(
          `/api/academies/${ids.academyId}/subscribe`,
          { tier: "STARTER", cycle: "MONTHLY", acceptRecurring: true },
          ownerSession,
        );
        // Pasa el gate de acceso — falla después en el gateway stub
        // (sin motor de suscripciones), nunca por billing.blocked.
        expect(res.status).toBe(400);
        expect((await res.json()).error).not.toBe("billing.blocked");
      });
    });
  });

  describe("PATCH /api/academies/:id/settings — website", () => {
    it("owner guarda dominio sin esquema → normaliza a https://", async () => {
      const res = await patch(
        `/api/academies/${ids.academyId}/settings`,
        { website: "academiatest.cl" },
        ownerSession,
      );
      expect(res.status).toBe(200);
      expect((await res.json()).website).toBe("https://academiatest.cl");
    });

    it("GET /profile público expone el website", async () => {
      const res = await get(
        `/api/academies/${ids.academyId}/profile`,
        outsiderSession,
      );
      expect(res.status).toBe(200);
      expect((await res.json()).website).toBe("https://academiatest.cl");
    });

    it("website inválido → 400", async () => {
      const res = await patch(
        `/api/academies/${ids.academyId}/settings`,
        { website: "not a url" },
        ownerSession,
      );
      expect(res.status).toBe(400);
    });

    it('"" limpia el website', async () => {
      const res = await patch(
        `/api/academies/${ids.academyId}/settings`,
        { website: "" },
        ownerSession,
      );
      expect(res.status).toBe(200);
      expect((await res.json()).website).toBeNull();
    });

    it("outsider no puede editar → 403", async () => {
      const res = await patch(
        `/api/academies/${ids.academyId}/settings`,
        { website: "x.cl" },
        outsiderSession,
      );
      expect(res.status).toBe(403);
    });
  });
});
