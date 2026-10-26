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
}

class FakePrisma {
  plans = [{ id: "plan-1", name: "Mensual" }];
  countryCode = "CL";
  people: FakePerson[] = [];
  enrollments: Record<string, unknown>[] = [];
  personCreates: Record<string, unknown>[] = [];
  seq = 0;

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
      const p: FakePerson = {
        id: `per-${++this.seq}`,
        email: data.email as string,
        phone: (data.phone as string | null) ?? null,
        phoneCountryCode: (data.phoneCountryCode as string | null) ?? null,
      };
      this.people.push(p);
      return { id: p.id, name: data.name };
    },
  };

  enrollment = {
    findFirst: async () => null,
    create: async ({ data }: { data: Record<string, unknown> }) => {
      this.enrollments.push(data);
      return data;
    },
    update: async () => ({}),
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
