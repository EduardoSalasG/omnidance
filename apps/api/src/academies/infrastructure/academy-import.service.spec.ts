import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Academy } from "@prisma/client";
import type { PrismaService } from "../../prisma.service";
import type { AuthService } from "../../auth/domain/auth.service";
import type { Mailer } from "../../auth/domain/ports";
import type { NotificationsService } from "../../notifications/domain/notifications.service";
import type { AcademyMaterializeService } from "./class-series-materialize.service";
import { AcademyImportService } from "./academy-import.service";

// AcademyImportService.importStudents - columna `telefono` (spec
// multipais-phone): normalizada a E.164 con el país de la academia
// (city → country, sin ciudad → CL); fila inválida = error de fila.

interface FakePerson {
  id: string;
  email: string;
  phone: string | null;
  phoneCountryCode: string | null;
  nationalId: string | null;
  birthDate: Date | null;
  gender: string | null;
}

class FakePrisma {
  plans = [{ id: "plan-1", name: "Mensual" }];
  countryCode = "CL";
  people: FakePerson[] = [];
  enrollments: Record<string, unknown>[] = [];
  enrollmentUpdates: Record<string, unknown>[] = [];
  existingEnrollment: { id: string; endsAt: Date | null } | null = null;
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
    };
    this.people.push(person);
    return person;
  }

  membershipPlan = {
    findMany: async () => this.plans,
  };

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
    findFirst: async () => this.existingEnrollment,
    create: async ({ data }: { data: Record<string, unknown> }) => {
      this.enrollments.push(data);
      return data;
    },
    update: async ({ data }: { data: Record<string, unknown> }) => {
      this.enrollmentUpdates.push(data);
      return data;
    },
  };

  // ActivityEvent (spec platform-trials): emit enrollment.started.
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

describe("AcademyImportService.importStudents - telefono", () => {
  let prisma: FakePrisma;
  let svc: AcademyImportService;

  beforeEach(() => {
    prisma = new FakePrisma();
    svc = new AcademyImportService(
      prisma as unknown as PrismaService,
      { createMagicToken: vi.fn(async () => "tok") } as unknown as AuthService,
      { send: vi.fn(async () => {}) } as unknown as Mailer,
      {} as AcademyMaterializeService,
      { notifySafe: vi.fn(async () => {}) } as unknown as NotificationsService,
    );
  });

  const row = (over: Record<string, string> = {}) => ({
    email: "alumno@correo.cl",
    nombre: "Alumno Uno",
    plan: "Mensual",
    telefono: "912345678",
    ...over,
  });

  it("teléfono nacional → E.164 + país de la academia (CL)", async () => {
    const [res] = await svc.importStudents(academy(), [row()]);
    expect(res.status).toBe("invited");
    expect(prisma.personCreates.at(-1)).toMatchObject({
      phone: "+56912345678",
      phoneCountryCode: "CL",
    });
  });

  it("academia argentina → nacional interpretado con AR", async () => {
    prisma.countryCode = "AR";
    await svc.importStudents(academy(), [row({ telefono: "11 5555 1234" })]);
    expect(prisma.personCreates.at(-1)).toMatchObject({
      phone: "+541155551234",
      phoneCountryCode: "AR",
    });
  });

  it("academia sin ciudad → default CL", async () => {
    await svc.importStudents(academy({ cityId: null }), [row()]);
    expect(prisma.personCreates.at(-1)).toMatchObject({
      phone: "+56912345678",
      phoneCountryCode: "CL",
    });
  });

  it("'+' en el CSV overridea el país de la academia", async () => {
    await svc.importStudents(academy(), [row({ telefono: "+34612345678" })]);
    expect(prisma.personCreates.at(-1)).toMatchObject({
      phone: "+34612345678",
      phoneCountryCode: "ES",
    });
  });

  it("teléfono inválido → error de fila sin abortar el import", async () => {
    const results = await svc.importStudents(academy(), [
      row({ email: "malo@correo.cl", telefono: "abc" }),
      row({ email: "bueno@correo.cl" }),
    ]);
    expect(results[0]).toMatchObject({
      status: "error",
      detail: "teléfono inválido",
    });
    expect(results[1].status).toBe("invited");
    // La fila inválida no creó Person; la válida sí.
    expect(prisma.people).toHaveLength(1);
    expect(prisma.people[0].email).toBe("bueno@correo.cl");
  });

  it("sin teléfono → Person sin phone ni código (no es error)", async () => {
    const [res] = await svc.importStudents(academy(), [
      row({ telefono: "" }),
    ]);
    expect(res.status).toBe("invited");
    expect(prisma.personCreates.at(-1)).toMatchObject({
      phone: null,
      phoneCountryCode: null,
    });
  });
});

// Campos mínimos de la importación de alumnos (change
// academy-import-slim-fields): solo email+nombre exigidos; plan
// opcional → Enrollment con planId null; columnas nuevas rut/dni/
// documento, fecha_nacimiento y sexo.
describe("AcademyImportService.importStudents - campos mínimos", () => {
  let prisma: FakePrisma;
  let svc: AcademyImportService;

  beforeEach(() => {
    prisma = new FakePrisma();
    svc = new AcademyImportService(
      prisma as unknown as PrismaService,
      { createMagicToken: vi.fn(async () => "tok") } as unknown as AuthService,
      { send: vi.fn(async () => {}) } as unknown as Mailer,
      {} as AcademyMaterializeService,
      { notifySafe: vi.fn(async () => {}) } as unknown as NotificationsService,
    );
  });

  it("fila solo email+nombre → invitada + Enrollment ACTIVE con planId null", async () => {
    const [res] = await svc.importStudents(academy(), [
      { email: "minimo@correo.cl", nombre: "Minima Uno" },
    ]);
    expect(res.status).toBe("invited");
    expect(prisma.enrollments.at(-1)).toMatchObject({
      planId: null,
      status: "ACTIVE",
      endsAt: null,
    });
  });

  it("plan vacío no es error → planId null; plan declarado conserva la semántica", async () => {
    const results = await svc.importStudents(academy(), [
      { email: "sin@correo.cl", nombre: "Sin Plan", plan: "" },
      { email: "con@correo.cl", nombre: "Con Plan", plan: "mensual" },
    ]);
    expect(results.map((r) => r.status)).toEqual(["invited", "invited"]);
    expect(prisma.enrollments[0]).toMatchObject({ planId: null });
    expect(prisma.enrollments[1]).toMatchObject({ planId: "plan-1" });
  });

  it("plan declarado inexistente → error de fila", async () => {
    const [res] = await svc.importStudents(academy(), [
      { email: "a@correo.cl", nombre: "A", plan: "Trimestral" },
    ]);
    expect(res.status).toBe("error");
    expect(res.detail).toContain("no existe");
    expect(prisma.people).toHaveLength(0);
  });

  it("rut chileno con puntos/guion → nationalId normalizado sin separadores", async () => {
    await svc.importStudents(academy(), [
      { email: "a@correo.cl", nombre: "A", rut: "12.345.678-9" },
      { email: "b@correo.cl", nombre: "B", rut: "1.234.567-k" },
    ]);
    expect(prisma.people[0].nationalId).toBe("123456789");
    expect(prisma.people[1].nationalId).toBe("1234567K");
  });

  it("aliases dni/documento → nationalId (libre para no-chilenos)", async () => {
    await svc.importStudents(academy(), [
      { email: "a@correo.cl", nombre: "A", dni: "abc 123" },
      { email: "b@correo.cl", nombre: "B", documento: "45.678.901" },
    ]);
    expect(prisma.people[0].nationalId).toBe("ABC 123");
    expect(prisma.people[1].nationalId).toBe("45678901");
  });

  it("fecha_nacimiento acepta DD/MM/YYYY e ISO YYYY-MM-DD", async () => {
    await svc.importStudents(academy(), [
      { email: "a@correo.cl", nombre: "A", fecha_nacimiento: "15/03/1990" },
      { email: "b@correo.cl", nombre: "B", fecha_nacimiento: "1990-03-15" },
    ]);
    expect(prisma.people[0].birthDate?.toISOString()).toBe(
      "1990-03-15T12:00:00.000Z",
    );
    expect(prisma.people[1].birthDate?.toISOString()).toBe(
      "1990-03-15T12:00:00.000Z",
    );
  });

  it("fecha_nacimiento no parseable → error de fila sin abortar", async () => {
    const results = await svc.importStudents(academy(), [
      {
        email: "mala@correo.cl",
        nombre: "Mala",
        fecha_nacimiento: "1990-02-31",
      },
      { email: "buena@correo.cl", nombre: "Buena" },
    ]);
    expect(results[0].status).toBe("error");
    expect(results[0].detail).toContain("fecha_nacimiento");
    expect(results[1].status).toBe("invited");
    expect(prisma.people).toHaveLength(1);
  });

  it("sexo mapea a Gender con aliases case-insensitive", async () => {
    await svc.importStudents(academy(), [
      { email: "a@correo.cl", nombre: "A", sexo: "m" },
      { email: "b@correo.cl", nombre: "B", sexo: "Femenino" },
      { email: "c@correo.cl", nombre: "C", sexo: "x" },
      { email: "d@correo.cl", nombre: "D", sexo: "MALE" },
    ]);
    expect(prisma.people.map((p) => p.gender)).toEqual([
      "M",
      "F",
      "OTHER",
      "M",
    ]);
  });

  it("sexo inválido → error de fila sin abortar", async () => {
    const results = await svc.importStudents(academy(), [
      { email: "malo@correo.cl", nombre: "Malo", sexo: "desconocido" },
      { email: "bueno@correo.cl", nombre: "Bueno", sexo: "f" },
    ]);
    expect(results[0].status).toBe("error");
    expect(results[0].detail).toContain("sexo");
    expect(results[1].status).toBe("invited");
  });

  it("update por email: solo sobreescribe los campos presentes en la fila", async () => {
    prisma.seedPerson({
      email: "existe@correo.cl",
      nationalId: "999",
      gender: "F",
    });
    await svc.importStudents(academy(), [
      {
        email: "existe@correo.cl",
        nombre: "Otro Nombre",
        rut: "11.111.111-1",
        sexo: "m",
      },
      { email: "existe@correo.cl", nombre: "Otro Nombre" },
    ]);
    // Fila 1: rut+sexo presentes → se setean (el resto conserva).
    expect(prisma.personUpdates[0]).toMatchObject({
      nationalId: "111111111",
      gender: "M",
    });
    expect(prisma.personUpdates[0]).not.toHaveProperty("birthDate");
    expect(prisma.personUpdates[0]).not.toHaveProperty("phone");
    // Fila 2: sin campos opcionales → no hay update de Person.
    expect(prisma.personUpdates).toHaveLength(1);
  });

  it("existente con Enrollment ACTIVE + fila sin plan → planId null, endsAt conserva", async () => {
    prisma.seedPerson({ email: "inscrito@correo.cl" });
    prisma.existingEnrollment = {
      id: "enr-1",
      endsAt: new Date(Date.UTC(2027, 5, 30, 12)),
    };
    const [res] = await svc.importStudents(academy(), [
      { email: "inscrito@correo.cl", nombre: "Inscrito" },
    ]);
    expect(res.status).toBe("updated");
    expect(prisma.enrollmentUpdates.at(-1)).toMatchObject({
      planId: null,
      endsAt: new Date(Date.UTC(2027, 5, 30, 12)),
    });
  });
});
