import { describe, it, expect, beforeEach, vi } from "vitest";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import type { Request } from "express";
import type { PrismaService } from "../../prisma.service";
import type { NotificationsService } from "../../notifications/domain/notifications.service";
import type { AcademyAccess } from "./academy-access.service";
// Ciclo session.guard ⇄ auth.controller (ver classes.controller.spec.ts).
import "../../auth/infrastructure/auth.controller";
import { ClassSeriesController } from "./class-series.controller";
import { AcademyMaterializeService } from "./class-series-materialize.service";

// Cascade de cancelación por la academia (spec class-credit-cancellation):
// desactivar serie / eliminar slot cancelan las clases futuras y TODAS
// las reservas activas quedan CANCELLED con refunded=true + cancelledAt -
// un alumno nunca pierde crédito por una decisión de la academia.

interface FakeCls {
  id: string;
  classSlotId: string;
  seriesId: string;
  date: Date;
  cancelled: boolean;
  // null = baja por cascada (revive al rematerializar); con fecha es
  // baja individual por instancia (el materializador no la toca).
  cancelledAt?: Date | null;
  instructorId?: string | null;
}

interface FakeSlot {
  id: string;
  academyId: string;
  seriesId: string;
  weekday?: number;
  oneOffDate?: Date | null;
  startTime?: string;
  endTime?: string;
  instructorId?: string | null;
  instructors?: { personId: string }[];
  deletedAt?: Date | null;
}

// Fiel a la semántica de Prisma update: undefined no escribe el campo
// (null sí). Sin esto, `{oneOffDate: undefined}` borraría la fecha del
// taller en el fake aunque el controller no la tocó.
function assignDefined<T extends object>(target: T, data: object): void {
  for (const [k, v] of Object.entries(data)) {
    if (v !== undefined) (target as Record<string, unknown>)[k] = v;
  }
}

interface FakeBooking {
  id: string;
  classId: string;
  status: "BOOKED" | "WAITLIST" | "CANCELLED";
  cancelledAt: Date | null;
  refunded: boolean;
}

interface FakeSeries {
  id: string;
  academyId: string;
  active: boolean;
  deletedAt: Date | null;
}

class FakePrisma {
  classes: FakeCls[] = [];
  bookings: FakeBooking[] = [];
  classInstructors: { classId: string; personId: string }[] = [];
  slotInstructors: { slotId: string; personId: string }[] = [];
  series = new Map<string, FakeSeries>();
  slots = new Map<string, FakeSlot>();
  private classSeq = 0;
  private slotSeq = 0;
  private seriesSeq = 0;

  class = {
    findMany: async ({ where }: { where: Record<string, unknown> }) =>
      this.classes.filter((c) => this.classMatches(c, where)),
    findFirst: async ({ where }: { where: Record<string, unknown> }) =>
      this.classes.find((c) => this.classMatches(c, where)) ?? null,
    findUniqueOrThrow: async ({ where }: { where: { id: string } }) => {
      const c = this.classes.find((x) => x.id === where.id);
      if (!c) throw new Error("clase no encontrada");
      return c;
    },
    count: async ({ where }: { where: Record<string, unknown> }) =>
      this.classes.filter((c) => this.classMatches(c, where)).length,
    createMany: async ({
      data,
    }: {
      data: { classSlotId: string; date: Date; instructorId?: string | null }[];
    }) => {
      for (const d of data) {
        this.classes.push({
          id: `gen-${++this.classSeq}`,
          classSlotId: d.classSlotId,
          seriesId: this.slots.get(d.classSlotId)?.seriesId ?? "",
          date: d.date,
          cancelled: false,
          cancelledAt: null,
          instructorId: d.instructorId ?? null,
        });
      }
      return { count: data.length };
    },
    updateMany: async ({
      where,
      data,
    }: {
      where: Record<string, unknown>;
      data: Partial<FakeCls>;
    }) => {
      const matched = this.classes.filter((c) => this.classMatches(c, where));
      for (const c of matched) assignDefined(c, data);
      return { count: matched.length };
    },
  };

  classBooking = {
    updateMany: async ({
      where,
      data,
    }: {
      where: {
        classId: string | { in: string[] };
        status: { in: string[] };
      };
      data: Partial<FakeBooking>;
    }) => {
      const classIds =
        typeof where.classId === "string"
          ? [where.classId]
          : (where.classId.in ?? []);
      let n = 0;
      for (const b of this.bookings) {
        if (classIds.includes(b.classId) && where.status.in.includes(b.status)) {
          Object.assign(b, data);
          n++;
        }
      }
      return { count: n };
    },
  };

  classSeries = {
    create: async ({ data }: { data: Record<string, unknown> }) => {
      const s = {
        id: `ser-new-${++this.seriesSeq}`,
        active: true,
        deletedAt: null,
        ...data,
      } as unknown as FakeSeries;
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
    findUniqueOrThrow: async ({ where }: { where: { id: string } }) => {
      const s = this.series.get(where.id);
      if (!s) throw new Error("serie no encontrada");
      return s;
    },
    update: async ({
      where,
      data,
    }: {
      where: { id: string };
      data?: Partial<FakeSeries>;
    }) => {
      const s = this.series.get(where.id);
      if (s && data) assignDefined(s, data);
      return s ?? null;
    },
  };

  classSlot = {
    create: async ({
      data,
    }: {
      data: {
        academyId: string;
        seriesId: string;
        weekday: number;
        oneOffDate?: Date | null;
        startTime: string;
        endTime: string;
        instructorId?: string | null;
        instructors?: { create: { personId: string }[] };
      };
    }) => {
      const slot: FakeSlot = {
        id: `slot-new-${++this.slotSeq}`,
        academyId: data.academyId,
        seriesId: data.seriesId,
        weekday: data.weekday,
        oneOffDate: data.oneOffDate ?? null,
        startTime: data.startTime,
        endTime: data.endTime,
        instructorId: data.instructorId ?? null,
        instructors: data.instructors?.create ?? [],
        deletedAt: null,
      };
      this.slots.set(slot.id, slot);
      return slot;
    },
    findFirst: async ({
      where,
    }: {
      where: { id: string; academyId: string };
    }) => {
      const s = this.slots.get(where.id);
      return s && s.academyId === where.academyId ? s : null;
    },
    delete: async ({ where }: { where: { id: string } }) => {
      const s = this.slots.get(where.id);
      this.slots.delete(where.id);
      return s ?? null;
    },
    update: async ({
      where,
      data,
    }: {
      where: { id: string };
      data?: Record<string, unknown>;
    }) => {
      const s = this.slots.get(where.id);
      if (s && data) assignDefined(s, data);
      return s ?? null;
    },
  };

  private classMatches(c: FakeCls, where: Record<string, unknown>): boolean {
    const w = where as {
      id?: string | { in?: string[] };
      classSlotId?: string;
      date?: { gte?: Date; lt?: Date; in?: Date[] };
      cancelled?: boolean;
      slot?: { seriesId?: string; academyId?: string };
    };
    if (typeof w.id === "string" && c.id !== w.id) return false;
    if (typeof w.id === "object" && w.id?.in && !w.id.in.includes(c.id))
      return false;
    if (w.classSlotId && c.classSlotId !== w.classSlotId) return false;
    if (w.cancelled !== undefined && c.cancelled !== w.cancelled)
      return false;
    if (w.date?.gte && c.date < w.date.gte) return false;
    if (w.date?.lt && c.date >= w.date.lt) return false;
    if (
      w.date?.in &&
      !w.date.in.some((d) => d.getTime() === c.date.getTime())
    )
      return false;
    if (w.slot?.seriesId && c.seriesId !== w.slot.seriesId) return false;
    if (
      w.slot?.academyId &&
      this.slots.get(c.classSlotId)?.academyId !== w.slot.academyId
    )
      return false;
    return true;
  }

  classInstructor = {
    deleteMany: async ({
      where,
    }: {
      where: { classId: { in: string[] } };
    }) => {
      this.classInstructors = this.classInstructors.filter(
        (i) => !where.classId.in.includes(i.classId),
      );
      return { count: 0 };
    },
    createMany: async ({
      data,
    }: {
      data: { classId: string; personId: string }[];
    }) => {
      this.classInstructors.push(...data);
      return { count: data.length };
    },
  };

  classSlotInstructor = {
    deleteMany: async ({ where }: { where: { slotId: string } }) => {
      this.slotInstructors = this.slotInstructors.filter(
        (i) => i.slotId !== where.slotId,
      );
      return { count: 0 };
    },
    createMany: async ({
      data,
    }: {
      data: { slotId: string; personId: string }[];
    }) => {
      this.slotInstructors.push(...data);
      return { count: data.length };
    },
  };

  classSeriesInstructor = {
    createMany: async ({
      data,
    }: {
      data: { seriesId: string; personId: string }[];
    }) => ({ count: data.length }),
  };

  $transaction = async <T>(
    cb: (tx: FakePrisma) => Promise<T>,
  ): Promise<T> => cb(this);
}

const req = { person: { id: "per-admin" } } as unknown as Request;
const future = () => new Date(Date.now() + 3 * 86_400_000);
// Próxima fecha (medianoche UTC) que cae en el weekday dado.
const nextWeekday = (d: number) => {
  const t = new Date();
  const delta = (d - t.getUTCDay() + 7) % 7 || 7;
  return new Date(
    Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate() + delta),
  );
};

describe("ClassSeriesController - cancelación por la academia devuelve crédito", () => {
  let prisma: FakePrisma;
  let ctrl: ClassSeriesController;

  beforeEach(() => {
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
    prisma.series.set("ser-1", {
      id: "ser-1",
      academyId: "acad-1",
      active: true,
      deletedAt: null,
    });
    prisma.slots.set("slot-1", {
      id: "slot-1",
      academyId: "acad-1",
      seriesId: "ser-1",
    });
  });

  it("deactivate: bookings BOOKED/WAITLIST → CANCELLED refunded=true", async () => {
    prisma.classes.push(
      { id: "c1", classSlotId: "slot-1", seriesId: "ser-1", date: future(), cancelled: false },
      { id: "c2", classSlotId: "slot-1", seriesId: "ser-1", date: future(), cancelled: false },
    );
    prisma.bookings.push(
      { id: "b1", classId: "c1", status: "BOOKED", cancelledAt: null, refunded: false },
      { id: "b2", classId: "c1", status: "WAITLIST", cancelledAt: null, refunded: true },
      { id: "b3", classId: "c2", status: "CANCELLED", cancelledAt: null, refunded: false },
    );

    await ctrl.deactivate("acad-1", "ser-1", req);

    const b1 = prisma.bookings.find((b) => b.id === "b1")!;
    const b2 = prisma.bookings.find((b) => b.id === "b2")!;
    const b3 = prisma.bookings.find((b) => b.id === "b3")!;
    expect(b1.status).toBe("CANCELLED");
    expect(b1.refunded).toBe(true); // refunded siempre - nunca quema cuota
    expect(b1.cancelledAt).toBeInstanceOf(Date);
    expect(b2.status).toBe("CANCELLED");
    expect(b2.refunded).toBe(true);
    // Una reserva ya cancelada no se toca (conserva su refunded=false).
    expect(b3.refunded).toBe(false);
    expect(prisma.classes.every((c) => c.cancelled)).toBe(true);
  });

  it("deleteSlot: idem para las clases futuras del horario", async () => {
    prisma.classes.push({
      id: "c1",
      classSlotId: "slot-1",
      seriesId: "ser-1",
      date: future(),
      cancelled: false,
    });
    prisma.bookings.push({
      id: "b1",
      classId: "c1",
      status: "BOOKED",
      cancelledAt: null,
      refunded: false,
    });

    await ctrl.deleteSlot("acad-1", "slot-1", req);

    const b1 = prisma.bookings.find((b) => b.id === "b1")!;
    expect(b1.status).toBe("CANCELLED");
    expect(b1.refunded).toBe(true);
    expect(b1.cancelledAt).toBeInstanceOf(Date);
    // Con historial de clases el horario queda en borrado lógico (Class.slot
    // es Restrict) - el hard delete solo corre cuando nunca tuvo clases.
    const slot = prisma.slots.get("slot-1") as
      | { deletedAt?: Date | null }
      | undefined;
    expect(slot?.deletedAt).toBeInstanceOf(Date);
  });

  it("deleteSlot sin clases: hard delete real", async () => {
    await ctrl.deleteSlot("acad-1", "slot-1", req);

    expect(prisma.slots.has("slot-1")).toBe(false);
  });

  it("updateSlot: el plantel nuevo se propaga a las clases futuras vigentes", async () => {
    const past = new Date(Date.now() - 3 * 86_400_000);
    prisma.classes.push(
      { id: "c1", classSlotId: "slot-1", seriesId: "ser-1", date: future(), cancelled: false, instructorId: "old" },
      { id: "c2", classSlotId: "slot-1", seriesId: "ser-1", date: future(), cancelled: true, instructorId: "old" },
      { id: "c3", classSlotId: "slot-1", seriesId: "ser-1", date: past, cancelled: false, instructorId: "old" },
    );
    prisma.classInstructors.push(
      { classId: "c1", personId: "old" },
      { classId: "c3", personId: "old" },
    );

    await ctrl.updateSlot(
      "acad-1",
      "slot-1",
      { instructorIds: ["p1", "p2"] },
      req,
    );

    // Clase futura vigente: roster reemplazado + primario = roster[0].
    expect(
      prisma.classInstructors.filter((i) => i.classId === "c1"),
    ).toEqual([
      { classId: "c1", personId: "p1" },
      { classId: "c1", personId: "p2" },
    ]);
    expect(prisma.classes.find((c) => c.id === "c1")!.instructorId).toBe("p1");
    // Cancelada y pasada: el historial conserva quién dio la clase.
    expect(prisma.classes.find((c) => c.id === "c2")!.instructorId).toBe("old");
    expect(
      prisma.classInstructors.filter((i) => i.classId === "c3"),
    ).toEqual([{ classId: "c3", personId: "old" }]);
    expect(prisma.classes.find((c) => c.id === "c3")!.instructorId).toBe("old");
  });

  it("updateSlot con cambio de día: cancela el día viejo y materializa el nuevo", async () => {
    prisma.slots.set("slot-1", {
      id: "slot-1",
      academyId: "acad-1",
      seriesId: "ser-1",
      weekday: 1,
      instructorId: null,
      instructors: [],
    });
    const monday = nextWeekday(1);
    prisma.classes.push({
      id: "c1",
      classSlotId: "slot-1",
      seriesId: "ser-1",
      date: monday,
      cancelled: false,
    });
    prisma.bookings.push({
      id: "b1",
      classId: "c1",
      status: "BOOKED",
      cancelledAt: null,
      refunded: false,
    });

    await ctrl.updateSlot("acad-1", "slot-1", { weekday: 3 }, req);

    // La clase del día viejo se cancela y la reserva se libera con
    // refunded (misma cascada que deleteSlot).
    const c1 = prisma.classes.find((c) => c.id === "c1")!;
    expect(c1.cancelled).toBe(true);
    const b1 = prisma.bookings.find((b) => b.id === "b1")!;
    expect(b1.status).toBe("CANCELLED");
    expect(b1.refunded).toBe(true);
    // El día nuevo queda materializado dentro de la ventana rodante.
    expect(
      prisma.classes.some(
        (c) =>
          c.classSlotId === "slot-1" &&
          c.date.getUTCDay() === 3 &&
          !c.cancelled,
      ),
    ).toBe(true);
  });

  it("deactivate = borrado lógico: active=false + deletedAt set", async () => {
    await ctrl.deactivate("acad-1", "ser-1", req);

    const s = prisma.series.get("ser-1")!;
    expect(s.active).toBe(false);
    expect(s.deletedAt).toBeInstanceOf(Date);
  });
});

// Taller de fecha única (oneOffDate) y cancelación por instancia
// (Class.cancelledAt) - spec academies/class-series delta
// workshop-one-off-class.

// Día UTC a medianoche, desplazado `delta` días desde hoy.
const utcDay = (delta: number) => {
  const t = new Date();
  return new Date(
    Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate() + delta),
  );
};
const ymd = (d: Date) =>
  `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;

describe("ClassSeriesController - taller de fecha única y cancel por instancia", () => {
  let prisma: FakePrisma;
  let ctrl: ClassSeriesController;
  let materialize: AcademyMaterializeService;

  beforeEach(() => {
    prisma = new FakePrisma();
    materialize = new AcademyMaterializeService(
      prisma as unknown as PrismaService,
    );
    ctrl = new ClassSeriesController(
      prisma as unknown as PrismaService,
      {
        requireCapability: vi.fn(async () => undefined),
        requireCapabilityWrite: vi.fn(async () => undefined),
      } as unknown as AcademyAccess,
      { notifySafe: vi.fn() } as unknown as NotificationsService,
      materialize,
    );
    prisma.series.set("ser-1", {
      id: "ser-1",
      academyId: "acad-1",
      active: true,
      deletedAt: null,
    });
  });

  it("create con date: el taller materializa una sola clase en esa fecha", async () => {
    const day = utcDay(10);
    await ctrl.create(
      "acad-1",
      {
        name: "Taller de shines",
        slots: [{ date: ymd(day), startTime: "19:00", endTime: "21:00" }],
      },
      req,
    );

    // Una sola instancia, exactamente el día pedido (nunca recurre).
    expect(prisma.classes).toHaveLength(1);
    expect(prisma.classes[0].date.getTime()).toBe(day.getTime());
    // El slot persiste oneOffDate y el weekday derivado (informativo).
    const slot = [...prisma.slots.values()][0];
    expect(slot.oneOffDate?.getTime()).toBe(day.getTime());
    expect(slot.weekday).toBe(day.getUTCDay());
  });

  it("create con date pasada responde 400 y no crea nada", async () => {
    await expect(
      ctrl.create(
        "acad-1",
        {
          name: "Taller",
          slots: [
            { date: ymd(utcDay(-5)), startTime: "19:00", endTime: "21:00" },
          ],
        },
        req,
      ),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.classes).toHaveLength(0);
    expect(prisma.slots.size).toBe(0);
  });

  it("create con date inválida (2026-02-30) responde 400", async () => {
    await expect(
      ctrl.create(
        "acad-1",
        {
          name: "Taller",
          slots: [
            { date: "2026-02-30", startTime: "19:00", endTime: "21:00" },
          ],
        },
        req,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it("create sin date ni weekday responde 400 (recurrente lo requiere)", async () => {
    await expect(
      ctrl.create(
        "acad-1",
        {
          name: "Serie",
          slots: [{ startTime: "19:00", endTime: "21:00" }],
        },
        req,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it("materializeSlot con oneOffDate pasada no materializa", async () => {
    prisma.slots.set("slot-1", {
      id: "slot-1",
      academyId: "acad-1",
      seriesId: "ser-1",
      weekday: utcDay(-3).getUTCDay(),
      oneOffDate: utcDay(-3),
      instructorId: null,
    });

    const r = await materialize.materializeSlot(
      prisma as unknown as PrismaService,
      {
        id: "slot-1",
        weekday: utcDay(-3).getUTCDay(),
        oneOffDate: utcDay(-3),
        instructorId: null,
      },
      materialize.rollingDates(),
    );

    expect(r).toEqual({ created: 0, revived: 0 });
    expect(prisma.classes).toHaveLength(0);
  });

  it("updateSlot con date: reprograma el taller (cancela, refund y materializa la nueva fecha)", async () => {
    const oldDay = utcDay(5);
    const newDay = utcDay(12);
    prisma.slots.set("slot-1", {
      id: "slot-1",
      academyId: "acad-1",
      seriesId: "ser-1",
      weekday: oldDay.getUTCDay(),
      oneOffDate: oldDay,
      startTime: "19:00",
      endTime: "21:00",
      instructorId: null,
      instructors: [],
    });
    prisma.classes.push({
      id: "c1",
      classSlotId: "slot-1",
      seriesId: "ser-1",
      date: oldDay,
      cancelled: false,
      cancelledAt: null,
    });
    prisma.bookings.push({
      id: "b1",
      classId: "c1",
      status: "BOOKED",
      cancelledAt: null,
      refunded: false,
    });

    const updated = await ctrl.updateSlot(
      "acad-1",
      "slot-1",
      { date: ymd(newDay) },
      req,
    );

    // La clase de la fecha vieja queda cancelada (cascada: cancelledAt
    // null) y la reserva se libera con refund.
    const c1 = prisma.classes.find((c) => c.id === "c1")!;
    expect(c1.cancelled).toBe(true);
    expect(c1.cancelledAt).toBeNull();
    const b1 = prisma.bookings.find((b) => b.id === "b1")!;
    expect(b1.status).toBe("CANCELLED");
    expect(b1.refunded).toBe(true);
    // Se materializa una sola clase en la fecha nueva.
    const fresh = prisma.classes.filter((c) => c.id !== "c1");
    expect(fresh).toHaveLength(1);
    expect(fresh[0].date.getTime()).toBe(newDay.getTime());
    expect(fresh[0].cancelled).toBe(false);
    // El slot quedó con la fecha nueva y el weekday derivado.
    expect(updated.oneOffDate?.getTime()).toBe(newDay.getTime());
    expect(updated.weekday).toBe(newDay.getUTCDay());
  });

  it("updateSlot sin date no des-convierte el taller a recurrente", async () => {
    const day = utcDay(5);
    prisma.slots.set("slot-1", {
      id: "slot-1",
      academyId: "acad-1",
      seriesId: "ser-1",
      weekday: day.getUTCDay(),
      oneOffDate: day,
      startTime: "19:00",
      endTime: "21:00",
      instructorId: null,
      instructors: [],
    });
    prisma.classes.push({
      id: "c1",
      classSlotId: "slot-1",
      seriesId: "ser-1",
      date: day,
      cancelled: false,
      cancelledAt: null,
    });

    await ctrl.updateSlot("acad-1", "slot-1", { startTime: "20:00" }, req);

    // oneOffDate intacta, la clase vigente no se cancela (sin cascada).
    const slot = prisma.slots.get("slot-1")!;
    expect(slot.oneOffDate?.getTime()).toBe(day.getTime());
    expect(slot.weekday).toBe(day.getUTCDay());
    expect(prisma.classes.find((c) => c.id === "c1")!.cancelled).toBe(false);
  });

  it("cancelClass: baja solo esa instancia con refund y el materializador no la revive", async () => {
    prisma.slots.set("slot-1", {
      id: "slot-1",
      academyId: "acad-1",
      seriesId: "ser-1",
      weekday: 3,
      instructorId: null,
    });
    const d1 = nextWeekday(3);
    const d2 = new Date(d1.getTime() + 7 * 86_400_000);
    const d3 = new Date(d1.getTime() + 14 * 86_400_000);
    prisma.classes.push(
      { id: "c1", classSlotId: "slot-1", seriesId: "ser-1", date: d1, cancelled: false, cancelledAt: null },
      { id: "c2", classSlotId: "slot-1", seriesId: "ser-1", date: d2, cancelled: false, cancelledAt: null },
      // c3 cancelada por cascada (cancelledAt null): sí debe revivir.
      { id: "c3", classSlotId: "slot-1", seriesId: "ser-1", date: d3, cancelled: true, cancelledAt: null },
    );
    prisma.bookings.push(
      { id: "b1", classId: "c1", status: "BOOKED", cancelledAt: null, refunded: false },
      { id: "b2", classId: "c2", status: "BOOKED", cancelledAt: null, refunded: false },
    );

    await ctrl.cancelClass("acad-1", "c1", req);

    const c1 = prisma.classes.find((c) => c.id === "c1")!;
    expect(c1.cancelled).toBe(true);
    expect(c1.cancelledAt).toBeInstanceOf(Date);
    const b1 = prisma.bookings.find((b) => b.id === "b1")!;
    expect(b1.status).toBe("CANCELLED");
    expect(b1.refunded).toBe(true);
    // Las demás instancias y sus reservas quedan intactas.
    expect(prisma.classes.find((c) => c.id === "c2")!.cancelled).toBe(false);
    expect(prisma.bookings.find((b) => b.id === "b2")!.status).toBe("BOOKED");

    // El materializador (job diario) no revive la baja individual -
    // sí revivió c3, cancelada por cascada (cancelledAt null).
    await materialize.materializeSlot(
      prisma as unknown as PrismaService,
      { id: "slot-1", weekday: 3, instructorId: null },
      materialize.rollingDates(),
    );
    expect(prisma.classes.find((c) => c.id === "c1")!.cancelled).toBe(true);
    expect(prisma.classes.find((c) => c.id === "c3")!.cancelled).toBe(false);
  });

  it("cancelClass es idempotente: re-cancelar responde OK sin efecto extra", async () => {
    prisma.slots.set("slot-1", {
      id: "slot-1",
      academyId: "acad-1",
      seriesId: "ser-1",
      weekday: 3,
      instructorId: null,
    });
    prisma.classes.push({
      id: "c1",
      classSlotId: "slot-1",
      seriesId: "ser-1",
      date: future(),
      cancelled: false,
      cancelledAt: null,
    });

    const first = await ctrl.cancelClass("acad-1", "c1", req);
    const again = await ctrl.cancelClass("acad-1", "c1", req);

    expect(again.cancelled).toBe(true);
    // El cancelledAt del re-cancel no se reescribe.
    expect(again.cancelledAt).toEqual(first.cancelledAt);
  });

  it("cancelClass de una clase pasada responde 404", async () => {
    prisma.slots.set("slot-1", {
      id: "slot-1",
      academyId: "acad-1",
      seriesId: "ser-1",
      weekday: 3,
      instructorId: null,
    });
    prisma.classes.push({
      id: "c1",
      classSlotId: "slot-1",
      seriesId: "ser-1",
      date: utcDay(-2),
      cancelled: false,
      cancelledAt: null,
    });

    await expect(ctrl.cancelClass("acad-1", "c1", req)).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.classes.find((c) => c.id === "c1")!.cancelled).toBe(false);
  });

  it("cancelClass de una clase de otra academia responde 404", async () => {
    prisma.slots.set("slot-x", {
      id: "slot-x",
      academyId: "acad-2",
      seriesId: "ser-x",
      weekday: 3,
      instructorId: null,
    });
    prisma.classes.push({
      id: "cx",
      classSlotId: "slot-x",
      seriesId: "ser-x",
      date: future(),
      cancelled: false,
      cancelledAt: null,
    });

    await expect(ctrl.cancelClass("acad-1", "cx", req)).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.classes.find((c) => c.id === "cx")!.cancelled).toBe(false);
  });
});
