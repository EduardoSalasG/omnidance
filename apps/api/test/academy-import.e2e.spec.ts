import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as XLSX from "xlsx";
import { Test } from "@nestjs/testing";
import { ValidationPipe, type INestApplication } from "@nestjs/common";
import { AuthModule } from "../src/auth/auth.module";
import { AuthService } from "../src/auth/domain/auth.service";
import { AcademiesModule } from "../src/academies/academies.module";
import { PrismaService } from "../src/prisma.service";
import { deletePeople } from "./helpers";

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

  const postFile = async (
    path: string,
    content: string | Uint8Array,
    filename: string,
    mime: string,
    session?: string,
  ) => {
    const fd = new FormData();
    fd.append("file", new Blob([content], { type: mime }), filename);
    return fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: session ? { cookie: `omnidance_session=${session}` } : {},
      body: fd,
    });
  };

  const postCsv = (
    path: string,
    csv: string,
    session?: string,
  ) => postFile(path, csv, "import.csv", "text/csv", session);

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
      // tier STUDIO: academia suscrita (spec platform-trials) - tier
      // null sin trial vigente resuelve features vacías y el import
      // responde 403 tier.required.
      data: { name: "Academia Import Test", ownerId: owner.id, reviewStatus: "APPROVED", tier: "STUDIO" },
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
    await prisma.academyInvite.deleteMany({
      where: { academyId: academyId.v },
    });
    await prisma.academyImportRun.deleteMany({
      where: { academyId: academyId.v },
    });
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
    await deletePeople(prisma, personIds);
    await app.close();
  });

  it("template de alumnos descarga CSV con header", async () => {
    const res = await get(
      `/api/academies/${academyId.v}/import/template/students`,
      ownerSession,
    );
    expect(res.status).toBe(200);
    const text = await res.text();
    // Change academy-import-slim-fields: orden contractual del template.
    expect(text).toContain(
      "email,nombre,rut,fecha_nacimiento,telefono,sexo",
    );
    expect(text).not.toContain("plan");
  });

  it("staff sin capacidad students no puede importar alumnos", async () => {
    const res = await postCsv(
      `/api/academies/${academyId.v}/import/students`,
      "email,nombre\nx@x.cl,X",
      staffNoCapsSession,
    );
    expect(res.status).toBe(403);
  });

  it("import de alumnos: invita nuevos, salta vigentes, errores por fila - SIN enrollments", async () => {
    const csv = [
      "email,nombre,telefono,plan,pagado_hasta",
      `import-new-1@omnidance.dev,Nuevo Uno,,Plan Mensual,${month}-28`,
      "import-existing@omnidance.dev,Alumno Existente,,,",
      "import-enrolled@omnidance.dev,Alumno Inscrito,,Plan Mensual,2027-06-30",
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

    // Nuevo + cuenta existente sin enrollment → invited; vigente → skipped.
    expect(byEmail.get("import-new-1@omnidance.dev")?.status).toBe("invited");
    expect(byEmail.get("import-existing@omnidance.dev")?.status).toBe(
      "invited",
    );
    expect(byEmail.get("import-enrolled@omnidance.dev")?.status).toBe(
      "skipped",
    );
    expect(byEmail.get("fila 5")?.status).toBe("error");
    expect(body.runId).toBeTruthy();

    // El stub existe pero SIN inscripción (nace de la compra, no del
    // import) y con invite pendiente.
    const stub = await prisma.person.findUniqueOrThrow({
      where: { email: "import-new-1@omnidance.dev" },
    });
    const enr = await prisma.enrollment.findFirst({
      where: { academyId: academyId.v, personId: stub.id },
    });
    expect(enr).toBeNull();
    const invite = await prisma.academyInvite.findFirst({
      where: {
        academyId: academyId.v,
        email: "import-new-1@omnidance.dev",
        consumedAt: null,
      },
    });
    expect(invite).toBeTruthy();
  });

  it("dryRun clasifica igual pero no escribe ni persiste corrida", async () => {
    const csv = [
      "email,nombre",
      "import-new-dry@omnidance.dev,Dry Uno",
      "import-enrolled@omnidance.dev,Alumno Inscrito",
    ].join("\n");
    const res = await postCsv(
      `/api/academies/${academyId.v}/import/students?dryRun=1`,
      csv,
      ownerSession,
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.results.map((r: { status: string }) => r.status)).toEqual([
      "invited",
      "skipped",
    ]);
    expect(body.runId).toBeNull();
    expect(
      await prisma.person.findUnique({
        where: { email: "import-new-dry@omnidance.dev" },
      }),
    ).toBeNull();
    expect(
      await prisma.academyInvite.findFirst({
        where: {
          academyId: academyId.v,
          email: "import-new-dry@omnidance.dev",
        },
      }),
    ).toBeNull();
  });

  it("historial: la corrida real aparece en /import/runs con detalle", async () => {
    const runs = await get(
      `/api/academies/${academyId.v}/import/runs`,
      ownerSession,
    );
    expect(runs.status).toBe(200);
    const { items } = await runs.json();
    expect(items.length).toBeGreaterThan(0);
    const studentsRun = items.find(
      (r: { kind: string }) => r.kind === "students",
    );
    expect(studentsRun).toBeTruthy();
    expect(studentsRun.counts.invited).toBeGreaterThan(0);

    const detail = await get(
      `/api/academies/${academyId.v}/import/runs/${studentsRun.id}`,
      ownerSession,
    );
    expect(detail.status).toBe(200);
    const { run } = await detail.json();
    expect(run.results.length).toBe(run.total);

    // Cross-academy / sin capacidad → 403.
    const forbidden = await get(
      `/api/academies/${academyId.v}/import/runs`,
      staffNoCapsSession,
    );
    expect(forbidden.status).toBe(403);
  });

  it("import sin columnas requeridas → 400", async () => {
    const res = await postCsv(
      `/api/academies/${academyId.v}/import/students`,
      "email,rut\na@b.cl,123",
      ownerSession,
    );
    expect(res.status).toBe(400);
  });

  it("fila mínima email+nombre → invitada SIN enrollment", async () => {
    const res = await postCsv(
      `/api/academies/${academyId.v}/import/students`,
      "email,nombre\nimport-new-min@omnidance.dev,Minima",
      ownerSession,
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.results[0].status).toBe("invited");
    const stub = await prisma.person.findUniqueOrThrow({
      where: { email: "import-new-min@omnidance.dev" },
    });
    const enr = await prisma.enrollment.findFirst({
      where: { academyId: academyId.v, personId: stub.id },
    });
    expect(enr).toBeNull();
  });

  it("columnas opcionales rut/fecha_nacimiento/sexo persisten en la Person", async () => {
    const res = await postCsv(
      `/api/academies/${academyId.v}/import/students`,
      [
        "email,nombre,rut,fecha_nacimiento,sexo",
        "import-new-doc@omnidance.dev,Con Doc,12.345.678-9,15/03/1990,Femenino",
        "import-new-sexo@omnidance.dev,Sexo Malo,,,desconocido",
      ].join("\n"),
      ownerSession,
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    const byEmail = new Map<string, { status: string; detail: string }>(
      body.results.map(
        (r: { email: string; status: string; detail: string }) => [
          r.email,
          r,
        ],
      ),
    );
    expect(byEmail.get("import-new-doc@omnidance.dev")?.status).toBe(
      "invited",
    );
    expect(byEmail.get("import-new-sexo@omnidance.dev")?.status).toBe(
      "error",
    );
    const stub = await prisma.person.findUniqueOrThrow({
      where: { email: "import-new-doc@omnidance.dev" },
    });
    expect(stub.nationalId).toBe("123456789");
    expect(stub.gender).toBe("F");
    expect(stub.birthDate?.toISOString()).toContain("1990-03-15");
  });

  it("import de alumnos vía .xlsx procesa las mismas filas que el CSV", async () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      ["email", "nombre", "sexo"],
      ["import-new-xls@omnidance.dev", "Desde Excel", "f"],
    ]);
    XLSX.utils.book_append_sheet(wb, ws, "Alumnos");
    const buffer = XLSX.write(wb, {
      type: "buffer",
      bookType: "xlsx",
    }) as Buffer;
    const res = await postFile(
      `/api/academies/${academyId.v}/import/students`,
      new Uint8Array(buffer),
      "alumnos.xlsx",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ownerSession,
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.results[0]).toMatchObject({
      email: "import-new-xls@omnidance.dev",
      status: "invited",
    });
    const stub = await prisma.person.findUniqueOrThrow({
      where: { email: "import-new-xls@omnidance.dev" },
    });
    expect(stub.gender).toBe("F");
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
      where: { academyId: academyId.v, name: "Serie Import" },
      include: { slots: { include: { classes: true } } },
    });
    expect(series.slots).toHaveLength(2);

    // Spec academy-console-v3: `capacidad` del CSV alimenta el quórum de
    // la serie (ya no vive por slot); las clases se materializan en la
    // ventana rodante hoy → fin del mes siguiente.
    expect(series.quorum).toBe(15);
    const monday = series.slots.find((s) => s.weekday === 1)!;
    const today = new Date();
    const windowEnd = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 2, 0),
    );
    let mondays = 0;
    for (
      let d = new Date(
        Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
      );
      d <= windowEnd;
      d = new Date(d.getTime() + 86_400_000)
    ) {
      if (d.getUTCDay() === 1) mondays += 1;
    }
    expect(monday.classes).toHaveLength(mondays);

    // Re-import no duplica slots ni clases.
    const res2 = await postCsv(
      `/api/academies/${academyId.v}/import/schedule`,
      csv.split("\n").slice(0, 2).join("\n"),
      ownerSession,
    );
    expect(res2.status).toBe(201);
    const series2 = await prisma.classSeries.findFirstOrThrow({
      where: { academyId: academyId.v, name: "Serie Import" },
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
