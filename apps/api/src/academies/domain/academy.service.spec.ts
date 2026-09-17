import { describe, it, expect } from "vitest";
import {
  assertEnrollmentTransition,
  canAdministerAcademy,
  canManageAcademy,
  computeDashboard,
  InvalidEnrollmentTransitionError,
  type AcademyContext,
  type PersonContext,
} from "./academy.service";

const academy = (over: Partial<AcademyContext> = {}): AcademyContext => ({
  ownerId: "owner-1",
  instructorIds: ["instructor-1"],
  ...over,
});

const person = (id: string, roles: string[] = []): PersonContext => ({
  id,
  roles,
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
      canManageAcademy(person("admin-9", ["ADMIN"]), academy()),
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
      canAdministerAcademy(person("admin", ["ADMIN"]), academy()),
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
