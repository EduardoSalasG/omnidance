import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Test } from "@nestjs/testing";
import { ValidationPipe, type INestApplication } from "@nestjs/common";
import { AuthModule } from "../src/auth/auth.module";
import { AuthService } from "../src/auth/domain/auth.service";
import { AcademiesModule } from "../src/academies/academies.module";
import { AcademyAccess } from "../src/academies/infrastructure/academy-access.service";
import { PrivateLessonsController } from "../src/academies/infrastructure/private-lessons.controller";
import { VideosController } from "../src/academies/infrastructure/videos.controller";
import { PrismaService } from "../src/prisma.service";

/**
 * Gap: clases privadas (PrivateLesson) y videos con acceso por asistencia
 * (Video.restrictedToAttended). Los controllers se registran acá a nivel de
 * TestingModule hasta que se cableen en AcademiesModule.
 */
describe("academies gap: private lessons + videos e2e", () => {
  let app: INestApplication;
  let baseUrl: string;
  let prisma: PrismaService;
  const auth = new AuthService(
    process.env.JWT_SECRET ?? "dev-secret-change-me",
  );

  let ownerSession: string;
  let instructorSession: string;
  let studentSession: string;
  let outsiderSession: string;

  const ids = {
    ownerId: "",
    instructorId: "",
    studentId: "",
    outsiderId: "",
    academyId: "",
    planId: "",
    slotId: "",
    classId: "",
    lessonId: "",
    lesson2Id: "",
    restrictedVideoId: "",
    openVideoId: "",
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
  const get = (path: string, session?: string) =>
    req("GET", path, undefined, session);
  const post = (path: string, body: unknown, session?: string) =>
    req("POST", path, body, session);
  const patch = (path: string, body: unknown, session?: string) =>
    req("PATCH", path, body, session);
  const del = (path: string, session?: string) =>
    req("DELETE", path, undefined, session);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AcademiesModule, AuthModule],
      controllers: [PrivateLessonsController, VideosController],
      providers: [PrismaService, AcademyAccess],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api");
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    await app.listen(0);
    prisma = app.get(PrismaService);
    const address = app.getHttpServer().address();
    baseUrl = `http://127.0.0.1:${address.port}`;

    // ─── fixtures ───
    const mkPerson = (
      name: string,
      roles: { role: "DANCER" | "ACADEMY_OWNER" | "INSTRUCTOR"; status: "APPROVED" }[],
    ) =>
      prisma.person
        .create({ data: { name, roles: { create: roles } } })
        .then((p) => {
          createdPersonIds.push(p.id);
          return p;
        });

    const owner = await mkPerson("Owner PL Test", [
      { role: "ACADEMY_OWNER", status: "APPROVED" },
    ]);
    ids.ownerId = owner.id;
    ownerSession = await auth.issueSession(owner.id);

    const instructor = await mkPerson("Instructor PL Test", [
      { role: "INSTRUCTOR", status: "APPROVED" },
    ]);
    ids.instructorId = instructor.id;
    instructorSession = await auth.issueSession(instructor.id);

    const student = await mkPerson("Alumno PL Test", [
      { role: "DANCER", status: "APPROVED" },
    ]);
    ids.studentId = student.id;
    studentSession = await auth.issueSession(student.id);

    const outsider = await mkPerson("Ajeno PL Test", [
      { role: "DANCER", status: "APPROVED" },
    ]);
    ids.outsiderId = outsider.id;
    outsiderSession = await auth.issueSession(outsider.id);

    const academy = await prisma.academy.create({
      data: { name: "Academia PL Test", ownerId: owner.id },
    });
    ids.academyId = academy.id;

    await prisma.academyInstructor.create({
      data: { academyId: academy.id, personId: instructor.id },
    });

    const plan = await prisma.membershipPlan.create({
      data: {
        academyId: academy.id,
        name: "Mensual PL",
        type: "MONTHLY",
        price: 40000,
      },
    });
    ids.planId = plan.id;

    await prisma.enrollment.create({
      data: {
        academyId: academy.id,
        personId: student.id,
        planId: plan.id,
        status: "ACTIVE",
      },
    });

    const slot = await prisma.classSlot.create({
      data: {
        academyId: academy.id,
        weekday: 3,
        startTime: "19:00",
        endTime: "20:00",
        capacity: 15,
      },
    });
    ids.slotId = slot.id;

    const cls = await prisma.class.create({
      data: { classSlotId: slot.id, date: new Date("2025-06-04T00:00:00Z") },
    });
    ids.classId = cls.id;

    // asistencia del alumno a esa clase (Attendance unique classId+personId)
    await prisma.attendance.create({
      data: { classId: cls.id, personId: student.id },
    });
  });

  afterAll(async () => {
    const academyIds = [ids.academyId].filter(Boolean);
    await prisma.video.deleteMany({ where: { academyId: { in: academyIds } } });
    await prisma.privateLesson.deleteMany({
      where: { academyId: { in: academyIds } },
    });
    await prisma.attendance.deleteMany({
      where: { class: { slot: { academyId: { in: academyIds } } } },
    });
    await prisma.class.deleteMany({
      where: { slot: { academyId: { in: academyIds } } },
    });
    await prisma.classSlot.deleteMany({
      where: { academyId: { in: academyIds } },
    });
    await prisma.enrollment.deleteMany({
      where: { academyId: { in: academyIds } },
    });
    await prisma.membershipPlan.deleteMany({
      where: { academyId: { in: academyIds } },
    });
    await prisma.academyInstructor.deleteMany({
      where: { academyId: { in: academyIds } },
    });
    await prisma.notification.deleteMany({
      where: { personId: { in: createdPersonIds } },
    });
    await prisma.personRole.deleteMany({
      where: { personId: { in: createdPersonIds } },
    });
    await prisma.person.deleteMany({ where: { id: { in: createdPersonIds } } });
    await prisma.academy.deleteMany({ where: { id: { in: academyIds } } });
    await app.close();
  });

  describe("POST /api/academies/:id/private-lessons", () => {
    it("sin sesión → 401", async () => {
      const res = await post(`/api/academies/${ids.academyId}/private-lessons`, {
        instructorId: ids.instructorId,
        scheduledAt: "2025-07-01T20:00:00Z",
      });
      expect(res.status).toBe(401);
    });

    it("alumno solicita → 201 REQUESTED con commissionPct 0", async () => {
      const res = await post(
        `/api/academies/${ids.academyId}/private-lessons`,
        {
          instructorId: ids.instructorId,
          scheduledAt: "2025-07-01T20:00:00Z",
          price: 30000,
        },
        studentSession,
      );
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.academyId).toBe(ids.academyId);
      expect(body.instructorId).toBe(ids.instructorId);
      expect(body.personId).toBe(ids.studentId);
      expect(body.status).toBe("REQUESTED");
      expect(body.commissionPct).toBe(0);
      expect(body.price).toBe(30000);
      ids.lessonId = body.id;
    });

    it("segunda clase del alumno para flujo de cancelación → 201", async () => {
      const res = await post(
        `/api/academies/${ids.academyId}/private-lessons`,
        {
          instructorId: ids.instructorId,
          scheduledAt: "2025-07-02T20:00:00Z",
        },
        studentSession,
      );
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.price).toBe(0); // default sin tarifa de instructor
      ids.lesson2Id = body.id;
    });

    it("instructor que no pertenece a la academia → 404", async () => {
      const res = await post(
        `/api/academies/${ids.academyId}/private-lessons`,
        {
          instructorId: ids.outsiderId,
          scheduledAt: "2025-07-01T20:00:00Z",
        },
        studentSession,
      );
      expect(res.status).toBe(404);
    });

    it("academia inexistente → 404", async () => {
      const res = await post(
        "/api/academies/academia-fantasma/private-lessons",
        {
          instructorId: ids.instructorId,
          scheduledAt: "2025-07-01T20:00:00Z",
        },
        studentSession,
      );
      expect(res.status).toBe(404);
    });
  });

  describe("GET /api/academies/:id/private-lessons", () => {
    it("owner lista con person e instructor joined", async () => {
      const res = await get(
        `/api/academies/${ids.academyId}/private-lessons`,
        ownerSession,
      );
      expect(res.status).toBe(200);
      const list = await res.json();
      const lesson = list.find((l: { id: string }) => l.id === ids.lessonId);
      expect(lesson).toBeTruthy();
      expect(lesson.person).toMatchObject({
        id: ids.studentId,
        name: "Alumno PL Test",
      });
      expect(lesson.instructor).toMatchObject({
        id: ids.instructorId,
        name: "Instructor PL Test",
      });
    });

    it("instructor también lista → 200", async () => {
      const res = await get(
        `/api/academies/${ids.academyId}/private-lessons`,
        instructorSession,
      );
      expect(res.status).toBe(200);
    });

    it("outsider → 403", async () => {
      const res = await get(
        `/api/academies/${ids.academyId}/private-lessons`,
        outsiderSession,
      );
      expect(res.status).toBe(403);
    });
  });

  describe("GET /api/private-lessons/mine", () => {
    it("alumno (default as=student) ve sus clases", async () => {
      const res = await get("/api/private-lessons/mine", studentSession);
      expect(res.status).toBe(200);
      const list = await res.json();
      expect(list.some((l: { id: string }) => l.id === ids.lessonId)).toBe(true);
      expect(
        list.every((l: { personId: string }) => l.personId === ids.studentId),
      ).toBe(true);
    });

    it("instructor con as=instructor ve las suyas", async () => {
      const res = await get(
        "/api/private-lessons/mine?as=instructor",
        instructorSession,
      );
      expect(res.status).toBe(200);
      const list = await res.json();
      expect(list.some((l: { id: string }) => l.id === ids.lessonId)).toBe(true);
      expect(
        list.every(
          (l: { instructorId: string }) => l.instructorId === ids.instructorId,
        ),
      ).toBe(true);
    });
  });

  describe("PATCH /api/private-lessons/:id", () => {
    it("done sobre REQUESTED → 409 transición inválida", async () => {
      const res = await patch(
        `/api/private-lessons/${ids.lessonId}`,
        { action: "done" },
        instructorSession,
      );
      expect(res.status).toBe(409);
    });

    it("alumno intenta confirmar → 403", async () => {
      const res = await patch(
        `/api/private-lessons/${ids.lessonId}`,
        { action: "confirm" },
        studentSession,
      );
      expect(res.status).toBe(403);
    });

    it("outsider intenta confirmar → 403", async () => {
      const res = await patch(
        `/api/private-lessons/${ids.lessonId}`,
        { action: "confirm" },
        outsiderSession,
      );
      expect(res.status).toBe(403);
    });

    it("instructor confirma → 200 CONFIRMED", async () => {
      const res = await patch(
        `/api/private-lessons/${ids.lessonId}`,
        { action: "confirm" },
        instructorSession,
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("CONFIRMED");
    });

    it("instructor reagenda → 200 mantiene status", async () => {
      const res = await patch(
        `/api/private-lessons/${ids.lessonId}`,
        { action: "reschedule", scheduledAt: "2025-07-05T21:00:00Z" },
        instructorSession,
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("CONFIRMED");
      expect(body.scheduledAt).toBe("2025-07-05T21:00:00.000Z");
    });

    it("instructor marca done → 200 DONE", async () => {
      const res = await patch(
        `/api/private-lessons/${ids.lessonId}`,
        { action: "done" },
        instructorSession,
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("DONE");
    });

    it("alumno cancela la suya en REQUESTED → 200 CANCELLED", async () => {
      const res = await patch(
        `/api/private-lessons/${ids.lesson2Id}`,
        { action: "cancel" },
        studentSession,
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("CANCELLED");
    });

    it("mutar CANCELLED → 409", async () => {
      const res = await patch(
        `/api/private-lessons/${ids.lesson2Id}`,
        { action: "cancel" },
        ownerSession,
      );
      expect(res.status).toBe(409);
    });

    it("clase inexistente → 404", async () => {
      const res = await patch(
        "/api/private-lessons/clase-fantasma",
        { action: "confirm" },
        ownerSession,
      );
      expect(res.status).toBe(404);
    });
  });

  describe("POST /api/academies/:id/videos", () => {
    it("owner crea video restringido ligado a la clase → 201", async () => {
      const res = await post(
        `/api/academies/${ids.academyId}/videos`,
        {
          url: "https://youtube.com/watch?v=restringido",
          title: "Repaso clase 4 jun",
          classId: ids.classId,
          restrictedToAttended: true,
        },
        ownerSession,
      );
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.restrictedToAttended).toBe(true);
      expect(body.classId).toBe(ids.classId);
      ids.restrictedVideoId = body.id;
    });

    it("owner crea video abierto → 201", async () => {
      const res = await post(
        `/api/academies/${ids.academyId}/videos`,
        {
          url: "https://vimeo.com/abierto",
          title: "Demo pública",
          restrictedToAttended: false,
        },
        ownerSession,
      );
      expect(res.status).toBe(201);
      ids.openVideoId = (await res.json()).id;
    });

    it("classId de otra academia / inexistente → 404", async () => {
      const res = await post(
        `/api/academies/${ids.academyId}/videos`,
        {
          url: "https://youtube.com/watch?v=x",
          title: "X",
          classId: "clase-fantasma",
        },
        ownerSession,
      );
      expect(res.status).toBe(404);
    });

    it("alumno intenta crear → 403", async () => {
      const res = await post(
        `/api/academies/${ids.academyId}/videos`,
        { url: "https://youtube.com/watch?v=y", title: "Y" },
        studentSession,
      );
      expect(res.status).toBe(403);
    });
  });

  describe("GET /api/academies/:id/videos", () => {
    it("sin sesión → 401", async () => {
      const res = await get(`/api/academies/${ids.academyId}/videos`);
      expect(res.status).toBe(401);
    });

    it("owner ve todos con url", async () => {
      const res = await get(
        `/api/academies/${ids.academyId}/videos`,
        ownerSession,
      );
      expect(res.status).toBe(200);
      const list = await res.json();
      const restricted = list.find(
        (v: { id: string }) => v.id === ids.restrictedVideoId,
      );
      expect(restricted.url).toBe("https://youtube.com/watch?v=restringido");
    });

    it("alumno con asistencia ve la url del video restringido", async () => {
      const res = await get(
        `/api/academies/${ids.academyId}/videos`,
        studentSession,
      );
      expect(res.status).toBe(200);
      const list = await res.json();
      const restricted = list.find(
        (v: { id: string }) => v.id === ids.restrictedVideoId,
      );
      expect(restricted.url).toBe("https://youtube.com/watch?v=restringido");
      expect(restricted.locked).toBe(false);
    });

    it("sin asistencia → locked sin url; abierto sí muestra url", async () => {
      const res = await get(
        `/api/academies/${ids.academyId}/videos`,
        outsiderSession,
      );
      expect(res.status).toBe(200);
      const list = await res.json();
      const restricted = list.find(
        (v: { id: string }) => v.id === ids.restrictedVideoId,
      );
      expect(restricted.locked).toBe(true);
      expect(restricted.url).toBeUndefined();
      expect(restricted.title).toBe("Repaso clase 4 jun");
      const open = list.find((v: { id: string }) => v.id === ids.openVideoId);
      expect(open.url).toBe("https://vimeo.com/abierto");
    });
  });

  describe("DELETE /api/academies/:id/videos/:videoId", () => {
    it("alumno intenta borrar → 403", async () => {
      const res = await del(
        `/api/academies/${ids.academyId}/videos/${ids.openVideoId}`,
        studentSession,
      );
      expect(res.status).toBe(403);
    });

    it("owner borra → 200 y ya no aparece", async () => {
      const res = await del(
        `/api/academies/${ids.academyId}/videos/${ids.openVideoId}`,
        ownerSession,
      );
      expect(res.status).toBe(200);
      const list = await (
        await get(`/api/academies/${ids.academyId}/videos`, ownerSession)
      ).json();
      expect(
        list.some((v: { id: string }) => v.id === ids.openVideoId),
      ).toBe(false);
    });

    it("video que no pertenece a la academia → 404", async () => {
      const res = await del(
        `/api/academies/${ids.academyId}/videos/video-fantasma`,
        ownerSession,
      );
      expect(res.status).toBe(404);
    });
  });
});
