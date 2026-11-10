import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Academy } from "@prisma/client";
import type { PrismaService } from "../../prisma.service";
import type { AuthService } from "../../auth/domain/auth.service";
import type { Mailer } from "../../auth/domain/ports";
import type { NotificationsService } from "../../notifications/domain/notifications.service";
import type { AcademyMaterializeService } from "./class-series-materialize.service";
import { AcademyImportService } from "./academy-import.service";
import { AcademyInvitesService } from "./academy-invites.service";

// AcademyImportService.importStudents (change academy-import-invites):
// el import es canal de INVITACIÓN - crea Person stub + AcademyInvite
// por fila, NUNCA escribe Enrollment. Skip por Enrollment ACTIVE.
// dryRun clasifica sin escribir; cada corrida real persiste
// AcademyImportRun.

interface FakePerson {
  id: string;
  email: string;
  phone: string | null;
  phoneCountryCode: string | null;
  nationalId: string | null;
  birthDate: Date | null;
  gender: string | null;
  deletedAt: Date | null;
}

class FakePrisma {
  countryCode = "CL";
  people: FakePerson[] = [];
  enrollments: Record<string, unknown>[] = [];
  invites: Record<string, unknown>[] = [];
  runs: Record<string, unknown>[] = [];
  personCreates: Record<string, unknown>[] = [];
  personUpdates: Record<string, unknown>[] = [];
  seq = 0;

  seedPerson(p: Partial<FakePerson> & { email: string }): FakePerson {
    const person: FakePerson = {
      id: p.id ?? `per-${++this.seq}`,
      email: p.email,
      phone: p.phone ?? null,
      phoneCountryCode: p.phoneCountryCode ?? null,
      nationalId: p.nationalId ?? null,
      birthDate: p.birthDate ?? null,
      gender: p.gender ?? null,
      deletedAt: p.deletedAt ?? null,
    };
    this.people.push(person);
    return person;
  }

  seedEnrollment(e: Record<string, unknown>) {
    this.enrollments.push(e);
  }

  seedInvite(i: Record<string, unknown>) {
    this.invites.push(i);
  }

  city = {
    findUnique: async () => ({ country: { code: this.countryCode } }),
  };

  person = {
    findUnique: async ({ where }: { where: { email: string } }) =>
      this.people.find((p) => p.email === where.email) ?? null,
    create: async ({ data }: { data: Record<string, unknown> }) => {
      this.personCreates.push(data);
      const p = this.seedPerson({
        email: data.email as string,
        phone: (data.phone as string | null) ?? null,
        phoneCountryCode: (data.phoneCountryCode as string | null) ?? null,
        nationalId: (data.nationalId as string | null) ?? null,
        birthDate: (data.birthDate as Date | null) ?? null,
        gender: (data.gender as string | null) ?? null,
      });
      return { id: p.id, name: data.name };
    },
    update: async ({
      data,
    }: {
      where: { id: string };
      data: Record<string, unknown>;
    }) => {
      this.personUpdates.push(data);
      return data;
    },
  };

  enrollment = {
    findFirst: async ({
      where,
    }: {
      where: Record<string, unknown>;
    }) =>
      this.enrollments.find(
        (e) =>
          e.academyId === where.academyId &&
          e.personId === where.personId &&
          e.status === where.status,
      ) ?? null,
  };

  academyInvite = {
    findFirst: async ({
      where,
    }: {
      where: { academyId: string; email: string; consumedAt: null };
    }) =>
      this.invites.find(
        (i) =>
          i.academyId === where.academyId &&
          i.email === where.email &&
          i.consumedAt == null,
      ) ?? null,
    create: async ({ data }: { data: Record<string, unknown> }) => {
      this.invites.push({ consumedAt: null, ...data });
      return { id: `inv-${this.invites.length}`, ...data };
    },
  };

  academyImportRun = {
    create: async ({ data }: { data: Record<string, unknown> }) => {
      this.runs.push(data);
      return { id: `run-${this.runs.length}`, ...data };
    },
  };

  // ActivityEvent: emit person.registered / invite.sent.
  activityEvent = {
    findFirst: async () => null,
    create: async ({ data }: { data: Record<string, unknown> }) => data,
  };
}

const academy = (over: Partial<Academy> = {}): Academy =>
  ({
    id: "ac-1",
    name: "Academia X",
    cityId: "city-1",
    ...over,
  }) as Academy;

const OPTS = { createdById: "staff-1" };

function makeSvc(prisma: FakePrisma, mailer?: { send: ReturnType<typeof vi.fn> }) {
  const m = mailer ?? { send: vi.fn(async () => {}) };
  const auth = { createMagicToken: vi.fn(async () => "tok") };
  const notifications = { notifySafe: vi.fn(async () => {}) };
  const invites = new AcademyInvitesService(
    prisma as unknown as PrismaService,
    auth as unknown as AuthService,
    m as unknown as Mailer,
    notifications as unknown as NotificationsService,
  );
  const svc = new AcademyImportService(
    prisma as unknown as PrismaService,
    {} as AcademyMaterializeService,
    notifications as unknown as NotificationsService,
    invites,
  );
  return { svc, auth, notifications, mailer: m };
}

describe("AcademyImportService.importStudents - invites", () => {
  let prisma: FakePrisma;
  let svc: AcademyImportService;
  let auth: { createMagicToken: ReturnType<typeof vi.fn> };
  let notifications: { notifySafe: ReturnType<typeof vi.fn> };
  let mailer: { send: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    prisma = new FakePrisma();
    mailer = { send: vi.fn(async () => {}) };
    ({ svc, auth, notifications } = makeSvc(prisma, mailer));
  });

  const row = (over: Record<string, string> = {}) => ({
    email: "alumno@correo.cl",
    nombre: "Alumno Uno",
    ...over,
  });

  it("persona nueva → Person stub + AcademyInvite + mail, SIN enrollment", async () => {
    const out = await svc.importStudents(academy(), [row()], OPTS);
    const res = out.results[0];
    expect(res.status).toBe("invited");
    expect(prisma.invites[0]).toMatchObject({
      academyId: "ac-1",
      email: "alumno@correo.cl",
      invitedById: "staff-1",
    });
    // El contrato nuevo: el import nunca escribe Enrollment.
    expect(out.runId).toBeTruthy();
    expect(mailer.send).toHaveBeenCalled();
  });

  it("cuenta existente sin enrollment → invited + push", async () => {
    prisma.seedPerson({ email: "cuenta@correo.cl" });
    const out = await svc.importStudents(
      academy(),
      [row({ email: "cuenta@correo.cl" })],
      OPTS,
    );
    expect(out.results[0].status).toBe("invited");
    expect(notifications.notifySafe).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ type: "academy.invite" }),
    );
  });

  it("enrollment ACTIVE en la academia → skipped sin invite ni mail", async () => {
    const p = prisma.seedPerson({ email: "vigente@correo.cl" });
    prisma.seedEnrollment({
      academyId: "ac-1",
      personId: p.id,
      status: "ACTIVE",
    });
    const out = await svc.importStudents(
      academy(),
      [row({ email: "vigente@correo.cl" })],
      OPTS,
    );
    expect(out.results[0].status).toBe("skipped");
    expect(prisma.invites).toHaveLength(0);
    expect(mailer.send).not.toHaveBeenCalled();
  });

  it("invite pendiente existente → resent sin duplicar fila", async () => {
    prisma.seedPerson({ email: "pend@correo.cl" });
    prisma.seedInvite({
      academyId: "ac-1",
      email: "pend@correo.cl",
      consumedAt: null,
    });
    const out = await svc.importStudents(
      academy(),
      [row({ email: "pend@correo.cl" })],
      OPTS,
    );
    expect(out.results[0].status).toBe("resent");
    expect(prisma.invites).toHaveLength(1);
  });

  it("email duplicado dentro de la planilla → skipped", async () => {
    const out = await svc.importStudents(
      academy(),
      [row(), row({ nombre: "Otro Nombre" })],
      OPTS,
    );
    expect(out.results[1].status).toBe("skipped");
    expect(prisma.invites).toHaveLength(1);
  });

  it("columnas legacy plan/pagado_hasta se ignoran (no hay error ni enrollment)", async () => {
    const out = await svc.importStudents(
      academy(),
      [row({ plan: "NoExiste", pagado_hasta: "2027-01-01" })],
      OPTS,
    );
    expect(out.results[0].status).toBe("invited");
  });

  it("dryRun → mismos resultados pero cero escrituras y envíos", async () => {
    const out = await svc.importStudents(
      academy(),
      [row(), row({ email: "otro@correo.cl", telefono: "abc" })],
      { ...OPTS, dryRun: true },
    );
    expect(out.results.map((r) => r.status)).toEqual(["invited", "error"]);
    expect(out.runId).toBeNull();
    expect(prisma.personCreates).toHaveLength(0);
    expect(prisma.personUpdates).toHaveLength(0);
    expect(prisma.invites).toHaveLength(0);
    expect(prisma.runs).toHaveLength(0);
    expect(mailer.send).not.toHaveBeenCalled();
  });

  it("corrida real persiste AcademyImportRun con conteos y resultados", async () => {
    const p = prisma.seedPerson({ email: "vigente@correo.cl" });
    prisma.seedEnrollment({
      academyId: "ac-1",
      personId: p.id,
      status: "ACTIVE",
    });
    await svc.importStudents(
      academy(),
      [row(), row({ email: "vigente@correo.cl" })],
      { ...OPTS, fileName: "alumnos.csv" },
    );
    expect(prisma.runs).toHaveLength(1);
    expect(prisma.runs[0]).toMatchObject({
      academyId: "ac-1",
      kind: "students",
      fileName: "alumnos.csv",
      total: 2,
      createdById: "staff-1",
    });
    expect(prisma.runs[0].counts).toMatchObject({
      invited: 1,
      skipped: 1,
      error: 0,
    });
  });
});

describe("AcademyImportService.importStudents - telefono", () => {
  let prisma: FakePrisma;
  let svc: AcademyImportService;

  beforeEach(() => {
    prisma = new FakePrisma();
    ({ svc } = makeSvc(prisma));
  });

  const row = (over: Record<string, string> = {}) => ({
    email: "alumno@correo.cl",
    nombre: "Alumno Uno",
    telefono: "912345678",
    ...over,
  });

  it("teléfono nacional → E.164 + país de la academia (CL)", async () => {
    const out = await svc.importStudents(academy(), [row()], OPTS);
    expect(out.results[0].status).toBe("invited");
    expect(prisma.personCreates.at(-1)).toMatchObject({
      phone: "+56912345678",
      phoneCountryCode: "CL",
    });
  });

  it("academia argentina → nacional interpretado con AR", async () => {
    prisma.countryCode = "AR";
    await svc.importStudents(academy(), [row({ telefono: "11 5555 1234" })], OPTS);
    expect(prisma.personCreates.at(-1)).toMatchObject({
      phone: "+541155551234",
      phoneCountryCode: "AR",
    });
  });

  it("academia sin ciudad → default CL", async () => {
    await svc.importStudents(academy({ cityId: null }), [row()], OPTS);
    expect(prisma.personCreates.at(-1)).toMatchObject({
      phone: "+56912345678",
      phoneCountryCode: "CL",
    });
  });

  it("'+' en el CSV overridea el país de la academia", async () => {
    await svc.importStudents(academy(), [row({ telefono: "+34612345678" })], OPTS);
    expect(prisma.personCreates.at(-1)).toMatchObject({
      phone: "+34612345678",
      phoneCountryCode: "ES",
    });
  });

  it("teléfono inválido → error de fila sin abortar el import", async () => {
    const out = await svc.importStudents(
      academy(),
      [
        row({ email: "malo@correo.cl", telefono: "abc" }),
        row({ email: "bueno@correo.cl" }),
      ],
      OPTS,
    );
    expect(out.results[0]).toMatchObject({
      status: "error",
      detail: "teléfono inválido",
    });
    expect(out.results[1].status).toBe("invited");
    // La fila inválida no creó Person; la válida sí.
    expect(prisma.people).toHaveLength(1);
    expect(prisma.people[0].email).toBe("bueno@correo.cl");
  });

  it("sin teléfono → Person sin phone ni código (no es error)", async () => {
    const out = await svc.importStudents(academy(), [
      row({ telefono: "" }),
    ], OPTS);
    expect(out.results[0].status).toBe("invited");
    expect(prisma.personCreates.at(-1)).toMatchObject({
      phone: null,
      phoneCountryCode: null,
    });
  });
});

// Campos mínimos (change academy-import-slim-fields): solo email+nombre
// exigidos; rut/dni/documento, fecha_nacimiento y sexo persisten en Person.
describe("AcademyImportService.importStudents - campos mínimos", () => {
  let prisma: FakePrisma;
  let svc: AcademyImportService;

  beforeEach(() => {
    prisma = new FakePrisma();
    ({ svc } = makeSvc(prisma));
  });

  it("fila solo email+nombre → invitada, sin enrollment", async () => {
    const out = await svc.importStudents(
      academy(),
      [{ email: "minimo@correo.cl", nombre: "Minima Uno" }],
      OPTS,
    );
    expect(out.results[0].status).toBe("invited");
    expect(prisma.invites).toHaveLength(1);
  });

  it("rut chileno con puntos/guion → nationalId normalizado sin separadores", async () => {
    await svc.importStudents(
      academy(),
      [
        { email: "a@correo.cl", nombre: "A", rut: "12.345.678-9" },
        { email: "b@correo.cl", nombre: "B", rut: "1.234.567-k" },
      ],
      OPTS,
    );
    expect(prisma.people[0].nationalId).toBe("123456789");
    expect(prisma.people[1].nationalId).toBe("1234567K");
  });

  it("aliases dni/documento → nationalId (libre para no-chilenos)", async () => {
    await svc.importStudents(
      academy(),
      [
        { email: "a@correo.cl", nombre: "A", dni: "abc 123" },
        { email: "b@correo.cl", nombre: "B", documento: "45.678.901" },
      ],
      OPTS,
    );
    expect(prisma.people[0].nationalId).toBe("ABC 123");
    expect(prisma.people[1].nationalId).toBe("45678901");
  });

  it("fecha_nacimiento acepta DD/MM/YYYY e ISO YYYY-MM-DD", async () => {
    await svc.importStudents(
      academy(),
      [
        { email: "a@correo.cl", nombre: "A", fecha_nacimiento: "15/03/1990" },
        { email: "b@correo.cl", nombre: "B", fecha_nacimiento: "1990-03-15" },
      ],
      OPTS,
    );
    expect(prisma.people[0].birthDate?.toISOString()).toBe(
      "1990-03-15T12:00:00.000Z",
    );
    expect(prisma.people[1].birthDate?.toISOString()).toBe(
      "1990-03-15T12:00:00.000Z",
    );
  });

  it("fecha_nacimiento no parseable → error de fila sin abortar", async () => {
    const out = await svc.importStudents(
      academy(),
      [
        {
          email: "mala@correo.cl",
          nombre: "Mala",
          fecha_nacimiento: "1990-02-31",
        },
        { email: "buena@correo.cl", nombre: "Buena" },
      ],
      OPTS,
    );
    expect(out.results[0].status).toBe("error");
    expect(out.results[0].detail).toContain("fecha_nacimiento");
    expect(out.results[1].status).toBe("invited");
    expect(prisma.people).toHaveLength(1);
  });

  it("sexo mapea a Gender con aliases case-insensitive", async () => {
    await svc.importStudents(
      academy(),
      [
        { email: "a@correo.cl", nombre: "A", sexo: "m" },
        { email: "b@correo.cl", nombre: "B", sexo: "Femenino" },
        { email: "c@correo.cl", nombre: "C", sexo: "x" },
        { email: "d@correo.cl", nombre: "D", sexo: "MALE" },
      ],
      OPTS,
    );
    expect(prisma.people.map((p) => p.gender)).toEqual([
      "M",
      "F",
      "OTHER",
      "M",
    ]);
  });

  it("sexo inválido → error de fila sin abortar", async () => {
    const out = await svc.importStudents(
      academy(),
      [
        { email: "malo@correo.cl", nombre: "Malo", sexo: "desconocido" },
        { email: "bueno@correo.cl", nombre: "Bueno", sexo: "f" },
      ],
      OPTS,
    );
    expect(out.results[0].status).toBe("error");
    expect(out.results[0].detail).toContain("sexo");
    expect(out.results[1].status).toBe("invited");
  });

  it("update por email: solo sobreescribe los campos presentes en la fila", async () => {
    prisma.seedPerson({
      email: "existe@correo.cl",
      nationalId: "999",
      gender: "F",
    });
    await svc.importStudents(
      academy(),
      [
        {
          email: "existe@correo.cl",
          nombre: "Otro Nombre",
          rut: "11.111.111-1",
          sexo: "m",
        },
      ],
      OPTS,
    );
    // rut+sexo presentes → se setean (el resto conserva).
    expect(prisma.personUpdates[0]).toMatchObject({
      nationalId: "111111111",
      gender: "M",
    });
    expect(prisma.personUpdates[0]).not.toHaveProperty("birthDate");
    expect(prisma.personUpdates[0]).not.toHaveProperty("phone");
  });
});
