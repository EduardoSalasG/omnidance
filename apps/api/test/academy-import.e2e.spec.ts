import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Test } from "@nestjs/testing";
import { ValidationPipe, type INestApplication } from "@nestjs/common";
import { AuthModule } from "../src/auth/auth.module";
import { AuthService } from "../src/auth/domain/auth.service";
import { AcademiesModule } from "../src/academies/academies.module";
import { PrismaService } from "../src/prisma.service";

describe("academy bulk import e2e (spec academy-bulk-import)", () => {
  let app: INestApplication;
  let baseUrl: string;
  let prisma: PrismaService;
  const auth = new AuthService(
    process.env.JWT_SECRET ?? "dev-secret-change-me",
  );

  let ownerSession: string;
  let staffNoCapsSession: string;
  const academyId = { v: "" };
  const planId = { v: "" };
  const createdPersonIds: string[] = [];
  const month = new Date().toISOString().slice(0, 7);

  const get = (path: string, session?: string) =>
    fetch(`${baseUrl}${path}`, {
      headers: session ? { cookie: `omnidance_session=${session}` } : {},
    });

  const postCsv = async (
    path: string,
    csv: string,
    session?: string,
  ) => {
    const fd = new FormData();
    fd.append("file", new Blob([csv], { type: "text/csv" }), "import.csv");
    return fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: session ? { cookie: `omnidance_session=${session}` } : {},
      body: fd,
    });
  };

  beforeAll(async () => {
    // Los imports invitan por email - sin key el mailer solo loguea.
    delete process.env.RESEND_API_KEY;
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

    const owner = await prisma.person.create({
      data: {
        name: "Owner Import Test",
        roles: { create: { role: "ACADEMY_OWNER", status: "APPROVED" } },
      },
    });
    createdPersonIds.push(owner.id);
    ownerSession = await auth.issueSession(owner.id);

    const academy = await prisma.academy.create({
      data: { name: "Academia Import Test", ownerId: owner.id },
    });
    academyId.v = academy.id;

    const plan = await prisma.membershipPlan.create({
      data: {
        academyId: academy.id,
        name: "Plan Mensual",
        type: "MONTHLY",
        price: 30000,
      },
    });
    planId.v = plan.id;

    // Staff sin capacidades - para probar el gate.
    const staff = await prisma.person.create({
      data: {
        name: "Staff Sin Caps",
        roles: { create: { role: "DANCER", status: "APPROVED" } },
      },
    });
    createdPersonIds.push(staff.id);
    await prisma.academyStaff.create({
      data: { academyId: academy.id, personId: staff.id },
    });
    staffNoCapsSession = await auth.issueSession(staff.id);

    // Alumno ya registrado + alumno con inscripción vigente.
    for (const [name, email] of [
      ["Alumno Existente", "import-existing@omnidance.dev"],
      ["Alumno Inscrito", "import-enrolled@omnidance.dev"],
    ] as const) {
      const p = await prisma.person.create({
        data: { name, email, roles: { create: { role: "DANCER", status: "APPROVED" } } },
      });
      createdPersonIds.push(p.id);
      if (email === "import-enrolled@omnidance.dev") {
        await prisma.enrollment.create({
          data: {
            academyId: academy.id,
            personId: p.id,
            planId: plan.id,
            status: "ACTIVE",
            endsAt: new Date(Date.UTC(2026, 0, 15, 12)),
          },
        });
      }
    }

    // Instructor para instructor_email del horario.
    const inst = await prisma.person.create({
      data: {
        name: "Profe Import",
        email: "import-profe@omnidance.dev",
        roles: { create: { role: "INSTRUCTOR", status: "APPROVED" } },
      },
    });
    createdPersonIds.push(inst.id);
    await prisma.academyInstructor.create({
      data: { academyId: academy.id, personId: inst.id },
    });
  });

  afterAll(async () => {
    await prisma.class.deleteMany({
      where: { slot: { academyId: academyId.v } },
    });
    await prisma.classSlot.deleteMany({ where: { academyId: academyId.v } });
    await prisma.classSeries.deleteMany({ where: { academyId: academyId.v } });
    await prisma.enrollment.deleteMany({ where: { academyId: academyId.v } });
    await prisma.academyStaff.deleteMany({
      where: { academyId: academyId.v },
    });
    await prisma.academyInstructor.deleteMany({
      where: { academyId: academyId.v },
    });
    await prisma.membershipPlan.deleteMany({
      where: { academyId: academyId.v },
    });
    await prisma.notification.deleteMany({
      where: { personId: { in: createdPersonIds } },
    });
    await prisma.academy.deleteMany({ where: { id: academyId.v } });
    // Personas stub creadas por el import (sin cuenta previa).
    const stubbed = await prisma.person.findMany({
      where: { email: { startsWith: "import-new" } },
      select: { id: true },
    });
    const personIds = [...createdPersonIds, ...stubbed.map((p) => p.id)];
    await prisma.personRole.deleteMany({
      where: { personId: { in: personIds } },
    });
    await prisma.person.deleteMany({ where: { id: { in: personIds } } });
    await app.close();
  });

  it("template de alumnos descarga CSV con header", async () => {
    const res = await get(
      `/api/academies/${academyId.v}/import/template/students`,
      ownerSession,
    );
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("email,nombre,telefono,plan,pagado_hasta");
  });

  it("staff sin capacidad students no puede importar alumnos", async () => {
    const res = await postCsv(
      `/api/academies/${academyId.v}/import/students`,
      "email,nombre,plan\nx@x.cl,X,Plan Mensual",
      staffNoCapsSession,
    );
    expect(res.status).toBe(403);
  });

  it("import de alumnos: invita nuevos, crea/actualiza inscripciones, errores por fila", async () => {
    const csv = [
      "email,nombre,telefono,plan,pagado_hasta",
      `import-new-1@omnidance.dev,Nuevo Uno,,Plan Mensual,${month}-28`,
      "import-existing@omnidance.dev,Alumno Existente,,plan mensual,", // match case-insensitive
      "import-enrolled@omnidance.dev,Alumno Inscrito,,Plan Mensual,2027-06-30",
      "import-new-2@omnidance.dev,Nuevo Dos,,Plan Inexistente,2026-11-30",
      ",Sin Email,,Plan Mensual,2026-11-30",
    ].join("\n");

    const res = await postCsv(
      `/api/academies/${academyId.v}/import/students`,
      csv,
      ownerSession,
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    const byEmail = new Map<string, { status: string }>(
      body.results.map((r: { email: string; status: string }) => [
        r.email,
        r,
      ]),
    );

    expect(byEmail.get("import-new-1@omnidance.dev")?.status).toBe("invited");
    expect(byEmail.get("import-existing@omnidance.dev")?.status).toBe(
      "imported",
    );
    expect(byEmail.get("import-enrolled@omnidance.dev")?.status).toBe(
      "updated",
    );
    expect(byEmail.get("import-new-2@omnidance.dev")?.status).toBe("error");
    expect(byEmail.get("fila 6")?.status).toBe("error");

    // El stub quedó con inscripción ACTIVE y endsAt mediodía UTC del día.
    const stub = await prisma.person.findUniqueOrThrow({
      where: { email: "import-new-1@omnidance.dev" },
    });
    const enr = await prisma.enrollment.findFirstOrThrow({
      where: { academyId: academyId.v, personId: stub.id },
    });
    expect(enr.status).toBe("ACTIVE");
    expect(enr.planId).toBe(planId.v);
    expect(enr.endsAt?.toISOString()).toContain(`${month}-28`);

    // endsAt = max(existente, importado) - la vigencia nueva gana.
    const enrolled = await prisma.person.findUniqueOrThrow({
      where: { email: "import-enrolled@omnidance.dev" },
    });
    const enr2 = await prisma.enrollment.findFirstOrThrow({
      where: { academyId: academyId.v, personId: enrolled.id },
    });
    expect(enr2.endsAt?.toISOString()).toContain("2027-06-30");
  });

  it("import sin columnas requeridas → 400", async () => {
    const res = await postCsv(
      `/api/academies/${academyId.v}/import/students`,
      "email,nombre\na@b.cl,A",
      ownerSession,
    );
    expect(res.status).toBe(400);
  });

  it("import de horario: serie upsert + slots dedup + clases materializadas", async () => {
    const csv = [
      "serie,estilo,nivel,dia_semana,hora_inicio,hora_fin,capacidad,instructor_email,mes",
      `Serie Import,,,lunes,19:00,20:30,15,import-profe@omnidance.dev,${month}`,
      `Serie Import,,,miercoles,19:00,20:30,,import-profe@omnidance.dev,${month}`,
      `Serie Import,,,nodia,10:00,11:00,,,${month}`,
      `Serie Import,,,viernes,21:00,20:00,,,${month}`,
    ].join("\n");

    const res = await postCsv(
      `/api/academies/${academyId.v}/import/schedule`,
      csv,
      ownerSession,
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    const statuses = body.results.map((r: { status: string }) => r.status);
    expect(statuses).toEqual(["ok", "ok", "error", "error"]);

    const series = await prisma.classSeries.findFirstOrThrow({
      where: { academyId: academyId.v, name: "Serie Import", month },
      include: { slots: { include: { classes: true } } },
    });
    expect(series.slots).toHaveLength(2);

    const monday = series.slots.find((s) => s.weekday === 1)!;
    expect(monday.capacity).toBe(15);
    const daysInMonth = new Date(
      Date.UTC(+month.slice(0, 4), +month.slice(5, 7), 0),
    ).getUTCDate();
    const mondays = Array.from({ length: daysInMonth }, (_, i) => i + 1).filter(
      (d) =>
        new Date(Date.UTC(+month.slice(0, 4), +month.slice(5, 7) - 1, d)).getUTCDay() ===
        1,
    ).length;
    expect(monday.classes).toHaveLength(mondays);

    // Re-import no duplica slots ni clases.
    const res2 = await postCsv(
      `/api/academies/${academyId.v}/import/schedule`,
      csv.split("\n").slice(0, 2).join("\n"),
      ownerSession,
    );
    expect(res2.status).toBe(201);
    const series2 = await prisma.classSeries.findFirstOrThrow({
      where: { academyId: academyId.v, name: "Serie Import", month },
      include: { slots: { include: { classes: true } } },
    });
    expect(series2.slots).toHaveLength(2);
  });

  it("instructor_email desconocido → warn pero slot se crea", async () => {
    const csv = [
      "serie,dia_semana,hora_inicio,hora_fin,instructor_email,mes",
      `Serie Warn,martes,18:00,19:00,nadie@omnidance.dev,${month}`,
    ].join("\n");
    const res = await postCsv(
      `/api/academies/${academyId.v}/import/schedule`,
      csv,
      ownerSession,
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.results[0].status).toBe("warn");
    const slot = await prisma.classSlot.findFirstOrThrow({
      where: { series: { name: "Serie Warn", academyId: academyId.v } },
    });
    expect(slot.instructorId).toBeNull();
  });
});
