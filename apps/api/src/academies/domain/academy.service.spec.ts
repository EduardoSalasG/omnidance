import { describe, it, expect } from "vitest";
import {
  assertEnrollmentTransition,
  canAdministerAcademy,
  canManageAcademy,
  computeActiveStudentsKpis,
  computeDashboard,
  computeUpcomingBirthdays,
  InvalidEnrollmentTransitionError,
  type AcademyContext,
  type PersonContext,
} from "./academy.service";

const academy = (over: Partial<AcademyContext> = {}): AcademyContext => ({
  ownerId: "owner-1",
  instructorIds: ["instructor-1"],
  ...over,
});

const person = (
  id: string,
  roles: string[] = [],
  isAdmin = false,
): PersonContext => ({
  id,
  roles,
  isAdmin,
});

describe("canManageAcademy", () => {
  it("el owner puede gestionar su academia", () => {
    expect(canManageAcademy(person("owner-1"), academy())).toBe(true);
  });

  it("un instructor de la academia puede gestionar", () => {
    expect(canManageAcademy(person("instructor-1"), academy())).toBe(true);
  });

  it("ADMIN puede gestionar cualquier academia", () => {
    expect(
      canManageAcademy(person("admin-9", ["ADMIN"], true), academy()),
    ).toBe(true);
  });

  it("un bailarín sin relación no puede gestionar", () => {
    expect(canManageAcademy(person("random", ["DANCER"]), academy())).toBe(
      false,
    );
  });

  it("un instructor de OTRA academia no puede gestionar", () => {
    expect(canManageAcademy(person("instructor-2"), academy())).toBe(false);
  });

  it("ACADEMY_OWNER de otra academia no puede gestionar esta", () => {
    expect(
      canManageAcademy(person("otro-owner", ["ACADEMY_OWNER"]), academy()),
    ).toBe(false);
  });
});

describe("canAdministerAcademy", () => {
  it("owner y admin administran", () => {
    expect(canAdministerAcademy(person("owner-1"), academy())).toBe(true);
    expect(
      canAdministerAcademy(person("admin", ["ADMIN"], true), academy()),
    ).toBe(true);
  });

  it("instructor NO administra (solo gestiona asistencia/detalle)", () => {
    expect(canAdministerAcademy(person("instructor-1"), academy())).toBe(
      false,
    );
  });
});

describe("assertEnrollmentTransition", () => {
  it("permite transición idempotente (mismo status)", () => {
    expect(() =>
      assertEnrollmentTransition("ACTIVE", "ACTIVE"),
    ).not.toThrow();
  });

  it.each([
    ["TRIAL", "ACTIVE"],
    ["TRIAL", "PAUSED"],
    ["ACTIVE", "PAUSED"],
    ["ACTIVE", "FROZEN"],
    ["ACTIVE", "ONLINE"],
    ["PAUSED", "ACTIVE"],
    ["PAUSED", "FROZEN"],
    ["FROZEN", "ACTIVE"],
    ["ONLINE", "ACTIVE"],
    ["ONLINE", "PAUSED"],
    ["ONLINE", "FROZEN"],
  ] as const)("permite %s → %s", (from, to) => {
    expect(() => assertEnrollmentTransition(from, to)).not.toThrow();
  });

  it.each([
    ["FROZEN", "TRIAL"],
    ["PAUSED", "TRIAL"],
    ["ACTIVE", "TRIAL"],
    ["ONLINE", "TRIAL"],
    ["TRIAL", "FROZEN"],
    ["FROZEN", "ONLINE"],
  ] as const)("rechaza %s → %s", (from, to) => {
    expect(() => assertEnrollmentTransition(from, to)).toThrow(
      InvalidEnrollmentTransitionError,
    );
  });
});

describe("computeDashboard", () => {
  it("agrega alumnos por status y KPIs", () => {
    const result = computeDashboard({
      enrollments: [
        { status: "ACTIVE" },
        { status: "ACTIVE" },
        { status: "TRIAL" },
        { status: "PAUSED" },
        { status: "FROZEN" },
        { status: "ONLINE" },
      ],
      plansCount: 3,
      attendanceLast30d: 42,
    });
    expect(result).toEqual({
      studentsByStatus: {
        active: 2,
        trial: 1,
        paused: 1,
        frozen: 1,
        online: 1,
      },
      totalStudents: 6,
      plansCount: 3,
      attendanceLast30d: 42,
    });
  });

  it("academia vacía → todo en cero", () => {
    expect(
      computeDashboard({
        enrollments: [],
        plansCount: 0,
        attendanceLast30d: 0,
      }),
    ).toEqual({
      studentsByStatus: { active: 0, trial: 0, paused: 0, frozen: 0, online: 0 },
      totalStudents: 0,
      plansCount: 0,
      attendanceLast30d: 0,
    });
  });
});

describe("computeActiveStudentsKpis", () => {
  const genders = new Map<string, string | null>([
    ["f1", "F"],
    ["f2", "F"],
    ["m1", "M"],
    ["o1", "OTHER"],
    ["n1", null],
  ]);

  it("cuenta personas únicas (2 enrollments de la misma persona → 1)", () => {
    const r = computeActiveStudentsKpis({
      nowIds: ["f1", "f1", "m1"],
      prevIds: ["f1"],
      genderById: genders,
    });
    expect(r.activeStudentsMonth).toBe(2);
    expect(r.activeStudentsMonthPrev).toBe(1);
  });

  it("porcentaje de género sobre el total de activos (sin declarar cuenta en el denominador)", () => {
    // 4 activos: 2F, 1M, 1 sin declarar → F=50%, M=25%.
    const r = computeActiveStudentsKpis({
      nowIds: ["f1", "f2", "m1", "n1"],
      prevIds: [],
      genderById: genders,
    });
    expect(r.pctWomenMonth).toBe(50);
    expect(r.pctMenMonth).toBe(25);
    // Sin base previa → null (la UI no dibuja comparativa).
    expect(r.pctWomenMonthPrev).toBeNull();
    expect(r.pctMenMonthPrev).toBeNull();
  });

  it("prev usa su propio set de personas; OTHER no suma a M ni F", () => {
    const r = computeActiveStudentsKpis({
      nowIds: ["m1"],
      prevIds: ["f1", "o1"],
      genderById: genders,
    });
    expect(r.pctMenMonth).toBe(100);
    expect(r.pctWomenMonthPrev).toBe(50);
    expect(r.pctMenMonthPrev).toBe(0);
  });

  it("sin alumnos → conteos 0 y porcentajes null", () => {
    const r = computeActiveStudentsKpis({
      nowIds: [],
      prevIds: [],
      genderById: genders,
    });
    expect(r).toEqual({
      activeStudentsMonth: 0,
      activeStudentsMonthPrev: 0,
      pctMenMonth: null,
      pctWomenMonth: null,
      pctMenMonthPrev: null,
      pctWomenMonthPrev: null,
    });
  });
});

describe("computeUpcomingBirthdays", () => {
  const today = new Date(Date.UTC(2026, 2, 1)); // 1 mar 2026
  const person = (id: string, birthDate: string | null) => ({
    id,
    name: `Alumno ${id}`,
    birthDate: birthDate ? new Date(birthDate) : null,
  });

  it("cumpleaños de hoy entra con daysUntil 0", () => {
    const [r] = computeUpcomingBirthdays([person("a", "1994-03-01")], today, 30);
    expect(r.daysUntil).toBe(0);
    expect(r.date).toEqual(new Date(Date.UTC(2026, 2, 1)));
  });

  it("dentro de la ventana entra; fuera queda excluido", () => {
    const res = computeUpcomingBirthdays(
      [person("dentro", "1994-03-20"), person("fuera", "1994-05-01")],
      today,
      30,
    );
    expect(res.map((r) => r.personId)).toEqual(["dentro"]);
  });

  it("cumpleaños ya pasado este año → cae al siguiente", () => {
    const [r] = computeUpcomingBirthdays([person("a", "1994-02-15")], today, 400);
    expect(r.date).toEqual(new Date(Date.UTC(2027, 1, 15)));
  });

  it("wrap dic → ene cruza el año", () => {
    const dec20 = new Date(Date.UTC(2026, 11, 20));
    const [r] = computeUpcomingBirthdays([person("a", "1994-01-05")], dec20, 30);
    expect(r.daysUntil).toBe(16);
    expect(r.date).toEqual(new Date(Date.UTC(2027, 0, 5)));
  });

  it("sin birthDate → excluido; orden por daysUntil", () => {
    const res = computeUpcomingBirthdays(
      [
        person("sin-fecha", null),
        person("tarde", "1994-03-28"),
        person("pronto", "1994-03-03"),
      ],
      today,
      30,
    );
    expect(res.map((r) => r.personId)).toEqual(["pronto", "tarde"]);
  });
});
