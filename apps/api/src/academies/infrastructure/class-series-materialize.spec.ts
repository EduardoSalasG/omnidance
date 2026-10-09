import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import type { Request } from "express";
import type { PrismaService } from "../../prisma.service";
import type { NotificationsService } from "../../notifications/domain/notifications.service";
import type { AcademyAccess } from "./academy-access.service";
// Ciclo session.guard ⇄ auth.controller (ver classes.controller.spec.ts).
import "../../auth/infrastructure/auth.controller";
import { ClassSeriesController } from "./class-series.controller";
import { AcademyMaterializeService } from "./class-series-materialize.service";

// Serie ilimitada (spec academies/class-series): la vigencia ya no es
// mensual - las clases se materializan sobre una ventana rodante
// hoy → fin del mes siguiente, en create/addSlots/reactivación y vía
// el job diario academies.class_materialization (idempotente).

interface FakeCls {
  id: string;
  classSlotId: string;
  date: Date;
  cancelled: boolean;
  instructorId: string | null;
}

interface FakeSlot {
  id: string;
  academyId: string;
  seriesId: string;
  weekday: number;
  startTime: string;
  endTime: string;
  capacity: number | null;
  instructorId: string | null;
}

interface FakeSeries {
  id: string;
  academyId: string;
  name: string;
  month: string;
  active: boolean;
}

class FakePrisma {
  classes: FakeCls[] = [];
  slots = new Map<string, FakeSlot>();
  series = new Map<string, FakeSeries>();
  private seq = 0;

  class = {
    findMany: async ({ where }: { where: Record<string, unknown> }) => {
      const w = where as {
        classSlotId?: string;
        date?: { in?: Date[] };
        cancelled?: boolean;
      };
      return this.classes.filter((c) => {
        if (w.classSlotId && c.classSlotId !== w.classSlotId) return false;
        if (w.date?.in && !w.date.in.some((d) => d.getTime() === c.date.getTime()))
          return false;
        if (w.cancelled !== undefined && c.cancelled !== w.cancelled)
          return false;
        return true;
      });
    },
    updateMany: async ({
      where,
      data,
    }: {
      where: { id: { in: string[] } };
      data: Partial<FakeCls>;
    }) => {
      for (const c of this.classes) {
        if (where.id.in.includes(c.id)) Object.assign(c, data);
      }
      return { count: where.id.in.length };
    },
    createMany: async ({ data }: { data: Omit<FakeCls, "id" | "cancelled">[] }) => {
      for (const d of data) {
        this.classes.push({
          id: `cls-${++this.seq}`,
          cancelled: false,
          ...d,
        });
      }
      return { count: data.length };
    },
  };

  classSlot = {
    findMany: async ({
      where,
    }: {
      where: { series?: { active?: boolean } };
    }) =>
      [...this.slots.values()].filter((s) => {
        const active = where.series?.active;
        if (active === undefined) return true;
        return this.series.get(s.seriesId)?.active === active;
      }),
    create: async ({ data }: { data: Partial<FakeSlot> & { types?: unknown } }) => {
      const slot: FakeSlot = {
        id: `slot-new-${++this.seq}`,
        academyId: "acad-1",
        seriesId: "",
        weekday: 0,
        startTime: "",
        endTime: "",
        capacity: null,
        instructorId: null,
        ...data,
      } as FakeSlot;
      this.slots.set(slot.id, slot);
      return slot;
    },
  };

  classSeries = {
    create: async ({ data }: { data: Partial<FakeSeries> & { types?: unknown } }) => {
      const s: FakeSeries = {
        id: `ser-new-${++this.seq}`,
        academyId: "acad-1",
        name: "",
        month: "",
        active: true,
        ...data,
      } as FakeSeries;
      this.series.set(s.id, s);
      return s;
    },
    findFirst: async ({
      where,
    }: {
      where: { id: string; academyId: string };
    }) => {
      const s = this.series.get(where.id);
      return s && s.academyId === where.academyId ? s : null;
    },
    update: async ({
      where,
      data,
      include,
    }: {
      where: { id: string };
      data: Partial<FakeSeries>;
      include?: unknown;
    }) => {
      const s = this.series.get(where.id)!;
      Object.assign(s, data);
      return include ? { ...s, slots: this.slotsOf(s.id) } : s;
    },
    findUnique: async ({ where }: { where: { id: string } }) =>
      this.series.get(where.id) ?? null,
    findUniqueOrThrow: async ({ where }: { where: { id: string } }) => {
      const s = this.series.get(where.id);
      if (!s) throw new Error("not found");
      return { ...s, slots: this.slotsOf(s.id) };
    },
  };

  classSeriesType = {
    deleteMany: async () => ({ count: 0 }),
    createMany: async () => ({ count: 0 }),
  };

  slotsOf(seriesId: string): FakeSlot[] {
    return [...this.slots.values()].filter((s) => s.seriesId === seriesId);
  }

  $transaction = async <T>(cb: (tx: FakePrisma) => Promise<T>): Promise<T> =>
    cb(this);
}

const req = { person: { id: "per-owner" } } as unknown as Request;

// Miércoles 21 oct 2026 (UTC) - la ventana rodante cubre 21-oct → 30-nov.
const NOW = new Date("2026-10-21T12:00:00Z");

describe("AcademyMaterializeService", () => {
  let prisma: FakePrisma;
  let svc: AcademyMaterializeService;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    prisma = new FakePrisma();
    svc = new AcademyMaterializeService(
      prisma as unknown as PrismaService,
    );
    prisma.series.set("ser-1", {
      id: "ser-1",
      academyId: "acad-1",
      name: "Bachata",
      month: "2026-10",
      active: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("materializa la ventana rodante: hoy → fin del mes siguiente", async () => {
    prisma.slots.set("slot-1", {
      id: "slot-1",
      academyId: "acad-1",
      seriesId: "ser-1",
      weekday: 3, // miércoles
      startTime: "19:00",
      endTime: "20:00",
      capacity: null,
      instructorId: null,
    });

    const meta = await svc.runDaily();

    const dates = prisma.classes.map((c) => c.date);
    // Miércoles dentro de 21-oct → 30-nov: 21, 28 oct + 4, 11, 18, 25 nov.
    expect(dates).toEqual([
      new Date("2026-10-21T00:00:00Z"),
      new Date("2026-10-28T00:00:00Z"),
      new Date("2026-11-04T00:00:00Z"),
      new Date("2026-11-11T00:00:00Z"),
      new Date("2026-11-18T00:00:00Z"),
      new Date("2026-11-25T00:00:00Z"),
    ]);
    expect(meta?.slots).toBe(1);
  });

  it("es idempotente: la segunda corrida no duplica ni crea de nuevo", async () => {
    prisma.slots.set("slot-1", {
      id: "slot-1",
      academyId: "acad-1",
      seriesId: "ser-1",
      weekday: 3,
      startTime: "19:00",
      endTime: "20:00",
      capacity: null,
      instructorId: null,
    });
    await svc.runDaily();
    const after = prisma.classes.length;
    const meta = await svc.runDaily();
    expect(prisma.classes.length).toBe(after);
    expect(meta?.created).toBe(0);
  });

  it("no materializa slots de series inactivas", async () => {
    prisma.series.get("ser-1")!.active = false;
    prisma.slots.set("slot-1", {
      id: "slot-1",
      academyId: "acad-1",
      seriesId: "ser-1",
      weekday: 3,
      startTime: "19:00",
      endTime: "20:00",
      capacity: null,
      instructorId: null,
    });
    await svc.runDaily();
    expect(prisma.classes).toHaveLength(0);
  });
});

describe("ClassSeriesController - serie ilimitada", () => {
  let prisma: FakePrisma;
  let ctrl: ClassSeriesController;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    prisma = new FakePrisma();
    ctrl = new ClassSeriesController(
      prisma as unknown as PrismaService,
      {
        requireCapability: vi.fn(async () => undefined),
        requireCapabilityWrite: vi.fn(async () => undefined),
      } as unknown as AcademyAccess,
      { notifySafe: vi.fn() } as unknown as NotificationsService,
      new AcademyMaterializeService(prisma as unknown as PrismaService),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("create sin month: persiste el mes actual y materializa la ventana rodante", async () => {
    const created = await ctrl.create(
      "acad-1",
      {
        name: "Salsa",
        slots: [{ weekday: 3, startTime: "19:00", endTime: "20:00" }],
        // Un cliente viejo podría mandar capacity/typeIds por slot - el
        // contrato nuevo los ignora (cupos/modalidad son de la serie).
      } as never,
      req,
    );

    expect(created!.month).toBe("2026-10");
    expect(prisma.classes.length).toBeGreaterThan(0);
    // Nada antes de hoy ni después del fin del mes siguiente.
    for (const c of prisma.classes) {
      expect(c.date.getTime()).toBeGreaterThanOrEqual(
        new Date("2026-10-21T00:00:00Z").getTime(),
      );
      expect(c.date.getTime()).toBeLessThanOrEqual(
        new Date("2026-11-30T00:00:00Z").getTime(),
      );
    }
    // El slot se crea sin cupos propios - hereda los de la serie.
    const slot = [...prisma.slots.values()][0];
    expect(slot.capacity).toBeNull();
  });

  it("addSlots materializa el nuevo horario sobre la ventana rodante", async () => {
    prisma.series.set("ser-1", {
      id: "ser-1",
      academyId: "acad-1",
      name: "Bachata",
      month: "2026-09", // serie "de septiembre" - sigue viva
      active: true,
    });
    prisma.slots.set("slot-1", {
      id: "slot-1",
      academyId: "acad-1",
      seriesId: "ser-1",
      weekday: 3,
      startTime: "19:00",
      endTime: "20:00",
      capacity: null,
      instructorId: null,
    });

    const updated = await ctrl.update(
      "acad-1",
      "ser-1",
      {
        addSlots: [
          { weekday: 4, startTime: "20:00", endTime: "21:00" },
        ],
      } as never,
      req,
    );

    // Jueves dentro de la ventana: 22, 29 oct + 5, 12, 19, 26 nov.
    const jueves = prisma.classes.filter(
      (c) => c.classSlotId !== "slot-1",
    );
    expect(jueves.length).toBe(6);
    expect(updated).toBeTruthy();
  });
});
