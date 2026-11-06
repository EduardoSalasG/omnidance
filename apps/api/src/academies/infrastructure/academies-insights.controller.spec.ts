import { ForbiddenException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
// Orden de import: auth.controller antes del controller bajo test -
// resuelve el ciclo de decoradores (mismo patrón que
// classes.controller.spec.ts).
import "../../auth/infrastructure/auth.controller";
import { AcademiesController } from "./academies.controller";

// spec academies/staff-roles: insights del módulo Alumnos - montos solo
// con la capacidad `payments`; el instructor recibe topPayersMonth: [].

type Person = { id: string; roles: string[] };

const reqAs = (p: Person) => ({ person: p }) as never;

function makePrisma() {
  return {
    membershipPlan: { findMany: vi.fn().mockResolvedValue([{ id: "plan-1" }]) },
    attendance: {
      groupBy: vi
        .fn()
        .mockResolvedValue([
          { personId: "p-1", _count: { _all: 12 } },
          { personId: "p-2", _count: { _all: 7 } },
        ]),
    },
    paymentClaim: {
      findMany: vi
        .fn()
        .mockResolvedValue([{ amount: 30000, personId: "p-2" }]),
    },
    payment: {
      findMany: vi
        .fn()
        .mockResolvedValue([{ amount: 50000, personId: "p-1" }]),
    },
    person: {
      findMany: vi
        .fn()
        .mockResolvedValue([
          { id: "p-1", name: "Ana" },
          { id: "p-2", name: "Beto" },
        ]),
    },
  };
}

function makeAccess(canPayments: boolean) {
  return {
    requireManage: vi.fn().mockResolvedValue({ academy: {}, ctx: {} }),
    requireCapability: vi
      .fn()
      .mockImplementation((_id: string, _p: unknown, cap: string) =>
        cap === "payments" && !canPayments
          ? Promise.reject(new ForbiddenException())
          : Promise.resolve({ academy: {}, ctx: {} }),
      ),
  } as never;
}

const makeCtrl = (prisma: unknown, access: unknown) =>
  new AcademiesController(
    prisma as never,
    access as never,
    {} as never,
    {} as never,
    {} as never, // FileStorage - no se usa en estos endpoints
      {} as never,
      {} as never,
  );

// spec academies/course-surveys: ?limit= capa los grupos mes × serie
// (default 12, max 60, inválido cae al default) - mismo contrato que
// /instructors/:personId/surveys.
function makeSurveysPrisma(groupCount: number) {
  // Meses desc como los ordena el findMany real: 2026-12, 2026-11, …
  const surveys = Array.from({ length: groupCount }, (_, i) => ({
    seriesId: "s-1",
    month: `${2026 - Math.floor(i / 12)}-${String(12 - (i % 12)).padStart(2, "0")}`,
    courseRating: 4,
    instructorRating: 5,
    comment: null,
    createdAt: new Date(0),
  }));
  return {
    courseSurvey: { findMany: vi.fn().mockResolvedValue(surveys) },
    classSeries: {
      findMany: vi
        .fn()
        .mockResolvedValue([{ id: "s-1", name: "Serie A" }]),
    },
  };
}

const surveysAccess = () =>
  ({ requireAdminister: vi.fn().mockResolvedValue({}) }) as never;

describe("AcademiesController.courseSurveys", () => {
  const owner = reqAs({ id: "owner-1", roles: ["ACADEMY_OWNER"] });

  it("?limit=2 devuelve solo los 2 grupos más recientes", async () => {
    const ctrl = makeCtrl(makeSurveysPrisma(15), surveysAccess());
    const res = await ctrl.courseSurveys(
      "acad-1",
      owner,
      undefined,
      undefined,
      "2",
    );
    expect(res.map((g) => g.month)).toEqual(["2026-12", "2026-11"]);
  });

  it("sin limit capa en 12; limit inválido cae al default", async () => {
    const ctrl = makeCtrl(makeSurveysPrisma(15), surveysAccess());
    const def = await ctrl.courseSurveys("acad-1", owner);
    const invalid = await ctrl.courseSurveys(
      "acad-1",
      owner,
      undefined,
      undefined,
      "abc",
    );
    expect(def.length).toBe(12);
    expect(invalid.length).toBe(12);
  });

  it("limit > 60 se capa en 60", async () => {
    const ctrl = makeCtrl(makeSurveysPrisma(65), surveysAccess());
    const res = await ctrl.courseSurveys(
      "acad-1",
      owner,
      undefined,
      undefined,
      "100",
    );
    expect(res.length).toBe(60);
  });
});

describe("AcademiesController.studentsInsights", () => {
  it("viewer sin cap payments → topAttendance con datos, topPayersMonth vacío y sin consultar cobros", async () => {
    const prisma = makePrisma();
    const access = makeAccess(false);
    const ctrl = makeCtrl(prisma, access);

    const res = await ctrl.studentsInsights(
      "acad-1",
      reqAs({ id: "inst-1", roles: ["INSTRUCTOR"] }),
    );

    expect(res.topAttendance.length).toBe(2);
    expect(res.topPayersMonth).toEqual([]);
    expect(
      (prisma as ReturnType<typeof makePrisma>).paymentClaim.findMany,
    ).not.toHaveBeenCalled();
    expect(
      (prisma as ReturnType<typeof makePrisma>).payment.findMany,
    ).not.toHaveBeenCalled();
  });

  it("viewer con cap payments → topPayersMonth ordenado por monto", async () => {
    const prisma = makePrisma();
    const access = makeAccess(true);
    const ctrl = makeCtrl(prisma, access);

    const res = await ctrl.studentsInsights(
      "acad-1",
      reqAs({ id: "owner-1", roles: ["ACADEMY_OWNER"] }),
    );

    expect(res.topPayersMonth).toEqual([
      { personId: "p-1", name: "Ana", amount: 50000 },
      { personId: "p-2", name: "Beto", amount: 30000 },
    ]);
  });
});
