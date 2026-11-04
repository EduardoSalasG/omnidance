import { ForbiddenException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
// Orden de import: auth.controller antes del controller bajo test -
// resuelve el ciclo de decoradores (mismo patrón que
// classes.controller.spec.ts).
import "../../auth/infrastructure/auth.controller";
import {
  AcademiesController,
  EnrollmentsController,
} from "./academies.controller";

// spec academies/enrollment-levels: nivel del alumno por tipo de
// clase (uno por tipo), gestionado solo por la academia; KPI
// tipo×nivel/horario del inicio Extendido (owner-insights).

type Person = { id: string; roles: string[] };

const reqAs = (p: Person) => ({ person: p }) as never;

const OWNER = { id: "owner-1", roles: ["ACADEMY_OWNER"] };

// ─── PATCH /enrollments/:id/levels ───

function makeLevelsPrisma(opts?: { enrollment?: unknown }) {
  const tx = {
    enrollmentLevel: {
      deleteMany: vi.fn().mockResolvedValue({ count: 2 }),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  };
  return {
    enrollment: {
      findUnique: vi
        .fn()
        .mockResolvedValue(
          opts && "enrollment" in opts
            ? opts.enrollment
            : { id: "enr-1", academyId: "acad-1" },
        ),
    },
    classType: {
      findMany: vi
        .fn()
        .mockResolvedValue([{ id: "ct-pareja" }, { id: "ct-shines" }]),
    },
    classLevel: {
      findMany: vi
        .fn()
        .mockResolvedValue([{ id: "lv-ini" }, { id: "lv-bas" }]),
    },
    $transaction: vi.fn().mockImplementation((cb: (t: unknown) => unknown) =>
      cb(tx),
    ),
    tx,
  };
}

const makeLevelsAccess = (ok = true) => ({
  requireCapabilityWrite: vi
    .fn()
    .mockImplementation(() =>
      ok
        ? Promise.resolve({ academy: {}, ctx: {} })
        : Promise.reject(new ForbiddenException("sin acceso")),
    ),
});

const makeEnrollmentsCtrl = (prisma: unknown, access: unknown) =>
  new EnrollmentsController(prisma as never, access as never);

describe("EnrollmentsController.setLevels", () => {
  it("reemplazo completo, un nivel por tipo: deleteMany + createMany dentro de $transaction", async () => {
    const prisma = makeLevelsPrisma();
    const ctrl = makeEnrollmentsCtrl(prisma, makeLevelsAccess());

    const res = await ctrl.setLevels(
      "enr-1",
      {
        levels: [
          { classTypeId: "ct-pareja", levelIds: ["lv-bas"] },
          { classTypeId: "ct-shines", levelIds: ["lv-ini"] },
        ],
      } as never,
      reqAs(OWNER),
    );

    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(prisma.tx.enrollmentLevel.deleteMany).toHaveBeenCalledWith({
      where: { enrollmentId: "enr-1" },
    });
    expect(prisma.tx.enrollmentLevel.createMany).toHaveBeenCalledWith({
      data: [
        { enrollmentId: "enr-1", classTypeId: "ct-pareja", levelId: "lv-bas" },
        { enrollmentId: "enr-1", classTypeId: "ct-shines", levelId: "lv-ini" },
      ],
    });
    expect(res).toEqual({
      enrollmentId: "enr-1",
      levels: [
        { classTypeId: "ct-pareja", levelIds: ["lv-bas"] },
        { classTypeId: "ct-shines", levelIds: ["lv-ini"] },
      ],
    });
  });

  it("400 si un tipo trae más de un levelId (un nivel por tipo)", async () => {
    const prisma = makeLevelsPrisma();
    const ctrl = makeEnrollmentsCtrl(prisma, makeLevelsAccess());

    // Van los dos tipos para pasar el check de catálogo: el 400 tiene
    // que salir por el multi-nivel, no por "tipo no encontrado".
    await expect(
      ctrl.setLevels(
        "enr-1",
        {
          levels: [
            { classTypeId: "ct-pareja", levelIds: ["lv-ini", "lv-bas"] },
            { classTypeId: "ct-shines", levelIds: ["lv-ini"] },
          ],
        } as never,
        reqAs(OWNER),
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("gate: exige cap students sobre la academia del enrollment", async () => {
    const prisma = makeLevelsPrisma();
    const access = makeLevelsAccess(false);
    const ctrl = makeEnrollmentsCtrl(prisma, access);

    await expect(
      ctrl.setLevels(
        "enr-1",
        { levels: [] } as never,
        reqAs({ id: "intruso", roles: [] }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(access.requireCapabilityWrite).toHaveBeenCalledWith(
      "acad-1",
      expect.anything(),
      "students",
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("404 si el enrollment no existe", async () => {
    const prisma = makeLevelsPrisma({ enrollment: null });
    const ctrl = makeEnrollmentsCtrl(prisma, makeLevelsAccess());

    await expect(
      ctrl.setLevels("enr-x", { levels: [] } as never, reqAs(OWNER)),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("400 si el mismo classTypeId viene dos veces", async () => {
    const prisma = makeLevelsPrisma();
    const ctrl = makeEnrollmentsCtrl(prisma, makeLevelsAccess());

    await expect(
      ctrl.setLevels(
        "enr-1",
        {
          levels: [
            { classTypeId: "ct-pareja", levelIds: ["lv-ini"] },
            { classTypeId: "ct-pareja", levelIds: ["lv-bas"] },
          ],
        } as never,
        reqAs(OWNER),
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("400 si un classTypeId no existe en el catálogo", async () => {
    const prisma = makeLevelsPrisma();
    prisma.classType.findMany.mockResolvedValue([{ id: "ct-pareja" }]);
    const ctrl = makeEnrollmentsCtrl(prisma, makeLevelsAccess());

    await expect(
      ctrl.setLevels(
        "enr-1",
        {
          levels: [
            { classTypeId: "ct-pareja", levelIds: ["lv-ini"] },
            { classTypeId: "ct-otro", levelIds: ["lv-ini"] },
          ],
        } as never,
        reqAs(OWNER),
      ),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("400 si un levelId no existe en el catálogo", async () => {
    const prisma = makeLevelsPrisma();
    prisma.classLevel.findMany.mockResolvedValue([{ id: "lv-ini" }]);
    const ctrl = makeEnrollmentsCtrl(prisma, makeLevelsAccess());

    await expect(
      ctrl.setLevels(
        "enr-1",
        { levels: [{ classTypeId: "ct-pareja", levelIds: ["lv-ini", "lv-x"] }] } as never,
        reqAs(OWNER),
      ),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("levels: [] borra todo sin createMany", async () => {
    const prisma = makeLevelsPrisma();
    const ctrl = makeEnrollmentsCtrl(prisma, makeLevelsAccess());

    const res = await ctrl.setLevels(
      "enr-1",
      { levels: [] } as never,
      reqAs(OWNER),
    );

    expect(prisma.tx.enrollmentLevel.deleteMany).toHaveBeenCalledWith({
      where: { enrollmentId: "enr-1" },
    });
    expect(prisma.tx.enrollmentLevel.createMany).not.toHaveBeenCalled();
    expect(res).toEqual({ enrollmentId: "enr-1", levels: [] });
  });
});

// ─── GET /academies/:id/insights/levels ───

function makeInsightsPrisma() {
  return {
    classType: {
      findMany: vi
        .fn()
        .mockResolvedValue([
          { id: "ct-pareja", name: "Pareja" },
          { id: "ct-shines", name: "Shines" },
        ]),
    },
    classLevel: {
      findMany: vi.fn().mockResolvedValue([
        { id: "lv-ini", name: "Iniciación", order: 0 },
        { id: "lv-bas", name: "Básico", order: 1 },
      ]),
    },
    classSlot: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: "slot-1",
          weekday: 1,
          startTime: "19:00",
          capacity: null, // hereda quorum de la serie
          types: [{ typeId: "ct-pareja" }],
          series: {
            name: "Bachata Lunes",
            quorum: 4,
            levelId: "lv-ini",
            types: [{ typeId: "ct-pareja" }],
          },
        },
        {
          id: "slot-2",
          weekday: 3,
          startTime: "20:00",
          capacity: 2, // override propio
          types: [], // hereda modalidades de la serie
          series: {
            name: "Shines Miércoles",
            quorum: null, // cae a academy.defaultQuorum → 20
            levelId: "lv-bas",
            types: [{ typeId: "ct-shines" }],
          },
        },
      ]),
    },
    enrollmentLevel: {
      findMany: vi.fn().mockResolvedValue([
        // e-1: Iniciación Pareja → cuenta en slot-1 y en byType Pareja/Ini.
        { enrollmentId: "e-1", classTypeId: "ct-pareja", levelId: "lv-ini", enrollment: { personId: "p-1" } },
        // e-1 con dos filas en el mismo tipo (dato legacy previo a la
        // regla de un nivel por tipo): cuenta en ambos niveles.
        { enrollmentId: "e-1", classTypeId: "ct-pareja", levelId: "lv-bas", enrollment: { personId: "p-1" } },
        // e-2: Básico Shines → cuenta en slot-2.
        { enrollmentId: "e-2", classTypeId: "ct-shines", levelId: "lv-bas", enrollment: { personId: "p-2" } },
        // e-3: Básico Pareja → NO matchea slot-1 (nivel distinto).
        { enrollmentId: "e-3", classTypeId: "ct-pareja", levelId: "lv-bas", enrollment: { personId: "p-3" } },
      ]),
    },
    enrollment: {
      count: vi.fn().mockResolvedValue(4), // 4 alumnos ACTIVE
    },
    person: {
      findMany: vi.fn().mockResolvedValue([
        { id: 'p-1', gender: 'M' },
        { id: 'p-2', gender: 'F' },
        { id: 'p-3', gender: 'M' },
        { id: 'p-4', gender: 'F' },
        { id: 'p-5', gender: 'M' },
      ]),
    },
    class: {
      findMany: vi.fn().mockResolvedValue([
        // ya ordenadas desc: dos clases recientes de slot-1.
        { classSlotId: "slot-1", attendances: [{ personId: "p-1" }, { personId: "p-2" }, { personId: "p-3" }], bookings: [{ personId: "p-1" }, { personId: "p-2" }] },
        { classSlotId: "slot-1", attendances: [{ personId: "p-1" }, { personId: "p-2" }, { personId: "p-3" }, { personId: "p-4" }, { personId: "p-5" }], bookings: [{ personId: "p-3" }] },
      ]),
    },
  };
}

const makeInsightsAccess = () => ({
  requireAdminister: vi.fn().mockResolvedValue({
    academy: { id: "acad-1", defaultQuorum: null }, // → piso 20
    ctx: {},
  }),
});

const makeAcademiesCtrl = (prisma: unknown, access: unknown) =>
  new AcademiesController(
    prisma as never,
    access as never,
    {} as never,
    {} as never,
    {} as never, // FileStorage - no se usa en este endpoint
  );

describe("AcademiesController.levelInsights", () => {
  it("gate: requireAdminister con feature insights", async () => {
    const prisma = makeInsightsPrisma();
    const access = makeInsightsAccess();
    const ctrl = makeAcademiesCtrl(prisma, access);

    await ctrl.levelInsights("acad-1", reqAs(OWNER));

    expect(access.requireAdminister).toHaveBeenCalledWith(
      "acad-1",
      expect.anything(),
      "insights",
    );
  });

  it("byType cuenta al alumno en cada nivel que tenga fila", async () => {
    const ctrl = makeAcademiesCtrl(
      makeInsightsPrisma(),
      makeInsightsAccess(),
    );

    const res = await ctrl.levelInsights("acad-1", reqAs(OWNER));

    const pareja = res.byType.find((t) => t.typeId === "ct-pareja")!;
    expect(pareja.levels).toEqual([
      { levelId: "lv-ini", levelName: "Iniciación", count: 1 },
      { levelId: "lv-bas", levelName: "Básico", count: 2 },
    ]);
    const shines = res.byType.find((t) => t.typeId === "ct-shines")!;
    expect(shines.levels).toEqual([
      { levelId: "lv-ini", levelName: "Iniciación", count: 0 },
      { levelId: "lv-bas", levelName: "Básico", count: 1 },
    ]);
  });

  it("unassigned: ACTIVE sin EnrollmentLevel del tipo", async () => {
    const ctrl = makeAcademiesCtrl(
      makeInsightsPrisma(),
      makeInsightsAccess(),
    );

    const res = await ctrl.levelInsights("acad-1", reqAs(OWNER));

    // 4 ACTIVE: Pareja tiene e-1/e-3 con nivel → 2 sin nivel;
    // Shines solo e-2 → 3 sin nivel.
    expect(res.unassigned).toEqual([
      { typeId: "ct-pareja", typeName: "Pareja", count: 2 },
      { typeId: "ct-shines", typeName: "Shines", count: 3 },
    ]);
  });

  it("bySlot: matching type×level, herencia de tipos y de capacidad", async () => {
    const ctrl = makeAcademiesCtrl(
      makeInsightsPrisma(),
      makeInsightsAccess(),
    );

    const res = await ctrl.levelInsights("acad-1", reqAs(OWNER));

    const slot1 = res.bySlot.find((s) => s.slotId === "slot-1")!;
    expect(slot1).toMatchObject({
      seriesName: "Bachata Lunes",
      levelId: "lv-ini",
      levelName: "Iniciación",
      weekday: 1,
      startTime: "19:00",
      types: [{ typeId: "ct-pareja", typeName: "Pareja" }],
      capacity: 4, // slot.capacity null → series.quorum
      assigned: 1, // solo e-1 (Ini Pareja); e-3 es Básico
      empty: 3,
      avgAttendance: 4, // (3+5)/2
      lastClassAttendance: 3,
    });

    const slot2 = res.bySlot.find((s) => s.slotId === "slot-2")!;
    expect(slot2).toMatchObject({
      levelId: "lv-bas",
      types: [{ typeId: "ct-shines", typeName: "Shines" }], // heredado de la serie
      capacity: 2, // override del slot gana sobre quorum/academia
      assigned: 1, // e-2 (Básico Shines)
      empty: 1,
      avgAttendance: null, // sin clases recientes
      lastClassAttendance: null,
    });
  });

  it("empty negativo cuando asignables > capacidad (sobrecupo)", async () => {
    const prisma = makeInsightsPrisma();
    // 3 alumnos Ini Pareja sobre capacidad 4 → ajusto a 2 para forzar
    // sobrecupo: mejor agrego dos más y dejo capacity 4-5=-1... más
    // simple: 5 asignables vs capacidad 4 → empty -1.
    prisma.enrollmentLevel.findMany.mockResolvedValue(
      ["e-1", "e-2", "e-3", "e-4", "e-5"].map((enrollmentId) => ({
        enrollmentId,
        classTypeId: "ct-pareja",
        levelId: "lv-ini",
        enrollment: { personId: enrollmentId.replace("e", "p") },
      })),
    );
    prisma.enrollment.count.mockResolvedValue(5);
    const ctrl = makeAcademiesCtrl(prisma, makeInsightsAccess());

    const res = await ctrl.levelInsights("acad-1", reqAs(OWNER));

    const slot1 = res.bySlot.find((s) => s.slotId === "slot-1")!;
    expect(slot1.assigned).toBe(5);
    expect(slot1.empty).toBe(-1);
  });

  // "Niveles y cupos" solo considera series vigentes (spec
  // academy-level-line-consistency): los mocks devuelven data fija -
  // la aserción va sobre el where con el que el endpoint consulta.
  it("los queries de slots y clases excluyen series con deletedAt", async () => {
    const prisma = makeInsightsPrisma();
    const ctrl = makeAcademiesCtrl(prisma, makeInsightsAccess());

    await ctrl.levelInsights("acad-1", reqAs(OWNER));

    // bySlot se alimenta solo de horarios de series vivas.
    expect(prisma.classSlot.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          academyId: "acad-1",
          deletedAt: null,
          series: { deletedAt: null },
        }),
      }),
    );
    // Asistencia reciente y próximas clases: acotadas a slots vigentes
    // de series vivas (solo alimentan los horarios listados).
    expect(prisma.class.findMany.mock.calls.length).toBeGreaterThan(0);
    for (const call of prisma.class.findMany.mock.calls) {
      expect(call[0].where.slot).toEqual({
        academyId: "acad-1",
        deletedAt: null,
        series: { deletedAt: null },
      });
    }
  });
});

// ─── DELETE /academies/:id/class-levels (reset a la línea global) ───

function makeResetPrisma(opts?: {
  custom?: { id: string; name: string }[];
  seriesUse?: string[];
  enrollmentUse?: string[];
}) {
  const custom = opts?.custom ?? [
    { id: "lv-c1", name: "Pro" },
    { id: "lv-c2", name: "Elite" },
  ];
  return {
    classLevel: {
      findMany: vi.fn().mockResolvedValue(custom),
      deleteMany: vi.fn().mockResolvedValue({ count: custom.length }),
    },
    classSeries: {
      findMany: vi
        .fn()
        .mockResolvedValue(
          (opts?.seriesUse ?? []).map((levelId) => ({ levelId })),
        ),
    },
    enrollmentLevel: {
      findMany: vi
        .fn()
        .mockResolvedValue(
          (opts?.enrollmentUse ?? []).map((levelId) => ({ levelId })),
        ),
    },
  };
}

describe("AcademiesController.deleteAcademyLevels", () => {
  it("gate: exige escritura de schedule sobre la academia", async () => {
    const prisma = makeResetPrisma();
    const access = makeLevelsAccess();
    const ctrl = makeAcademiesCtrl(prisma, access);

    await ctrl.deleteAcademyLevels("acad-1", reqAs(OWNER));

    expect(access.requireCapabilityWrite).toHaveBeenCalledWith(
      "acad-1",
      expect.anything(),
      "schedule",
    );
  });

  it("borra todos los niveles custom en una sola operación", async () => {
    const prisma = makeResetPrisma();
    const ctrl = makeAcademiesCtrl(prisma, makeLevelsAccess());

    const res = await ctrl.deleteAcademyLevels("acad-1", reqAs(OWNER));

    expect(prisma.classLevel.deleteMany).toHaveBeenCalledWith({
      where: { academyId: "acad-1" },
    });
    expect(res).toEqual({ ok: true, deleted: 2 });
  });

  it("idempotente: sin customs no borra nada", async () => {
    const prisma = makeResetPrisma({ custom: [] });
    const ctrl = makeAcademiesCtrl(prisma, makeLevelsAccess());

    const res = await ctrl.deleteAcademyLevels("acad-1", reqAs(OWNER));

    expect(res).toEqual({ ok: true, deleted: 0 });
    expect(prisma.classLevel.deleteMany).not.toHaveBeenCalled();
  });

  it("409 con los nombres en uso: no borra nada", async () => {
    const prisma = makeResetPrisma({
      seriesUse: ["lv-c1"],
      enrollmentUse: ["lv-c2"],
    });
    const ctrl = makeAcademiesCtrl(prisma, makeLevelsAccess());

    await expect(
      ctrl.deleteAcademyLevels("acad-1", reqAs(OWNER)),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      ctrl.deleteAcademyLevels("acad-1", reqAs(OWNER)),
    ).rejects.toThrow(/Pro.*Elite|Elite.*Pro/);
    expect(prisma.classLevel.deleteMany).not.toHaveBeenCalled();
  });
});

// ─── GET /academies/:id/students/:personId - set vigente en la ficha ───
// El editor de niveles abre con la marca actual: levels viaja en cada
// enrollment del perfil (spec academies/enrollment-levels).

describe("AcademiesController.studentDetail - niveles vigentes", () => {
  it("cada enrollment del perfil incluye su set de niveles", async () => {
    const prisma = {
      person: {
        findUnique: vi
          .fn()
          .mockResolvedValue({ id: "p-1", name: "Alumna" }),
      },
      enrollment: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "e-1",
            status: "ACTIVE",
            startedAt: new Date("2026-01-01"),
            endsAt: null,
            plan: { id: "pl-1", name: "Mensual", type: "PERIOD", price: 50000 },
            levels: [
              { classTypeId: "ct-pareja", levelId: "lv-bas" },
            ],
          },
        ]),
      },
      attendance: { findMany: vi.fn().mockResolvedValue([]) },
      classBooking: { findMany: vi.fn().mockResolvedValue([]) },
      relationshipScore: { findUnique: vi.fn().mockResolvedValue(null) },
    };
    const access = {
      requireManage: vi.fn().mockResolvedValue({ academy: {}, ctx: {} }),
      requireCapability: vi.fn().mockResolvedValue({ academy: {}, ctx: {} }),
    };
    const ctrl = makeAcademiesCtrl(prisma, access);

    const res = await ctrl.studentDetail("acad-1", "p-1", reqAs(OWNER));

    expect(res.enrollments[0]?.levels).toEqual([
      { classTypeId: "ct-pareja", levelId: "lv-bas" },
    ]);
  });
});

// ─── GET /academies/:id/slots - series borradas fuera de la parrilla ───
// (spec academy-level-line-consistency).

describe("AcademiesController.listSlots", () => {
  it("la parrilla excluye horarios de series con deletedAt", async () => {
    const prisma = {
      classSlot: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const access = {
      requireCapability: vi
        .fn()
        .mockResolvedValue({ academy: {}, ctx: {} }),
    };
    const ctrl = makeAcademiesCtrl(prisma, access);

    await ctrl.listSlots("acad-1", reqAs(OWNER));

    expect(access.requireCapability).toHaveBeenCalledWith(
      "acad-1",
      expect.anything(),
      "schedule",
      "classes",
    );
    expect(prisma.classSlot.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          academyId: "acad-1",
          series: { deletedAt: null },
        }),
      }),
    );
  });
});
