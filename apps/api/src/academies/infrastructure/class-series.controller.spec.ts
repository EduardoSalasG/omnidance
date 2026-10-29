import { describe, it, expect, beforeEach, vi } from "vitest";
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
  instructorId?: string | null;
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
  slots = new Map<
    string,
    {
      id: string;
      academyId: string;
      seriesId: string;
      weekday?: number;
      instructorId?: string | null;
      instructors?: { personId: string }[];
      deletedAt?: Date | null;
    }
  >();
  private classSeq = 0;

  class = {
    findMany: async ({ where }: { where: Record<string, unknown> }) =>
      this.classes.filter((c) => this.classMatches(c, where)),
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
          instructorId: d.instructorId ?? null,
        });
      }
      return { count: data.length };
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
  };

  classBooking = {
    updateMany: async ({
      where,
      data,
    }: {
      where: { classId: { in: string[] }; status: { in: string[] } };
      data: Partial<FakeBooking>;
    }) => {
      let n = 0;
      for (const b of this.bookings) {
        if (
          where.classId.in.includes(b.classId) &&
          where.status.in.includes(b.status)
        ) {
          Object.assign(b, data);
          n++;
        }
      }
      return { count: n };
    },
  };

  classSeries = {
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
    }: {
      where: { id: string };
      data?: Partial<FakeSeries>;
    }) => {
      const s = this.series.get(where.id);
      if (s && data) Object.assign(s, data);
      return s ?? null;
    },
  };

  classSlot = {
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
      if (s && data) Object.assign(s, data);
      return s ?? null;
    },
  };

  private classMatches(c: FakeCls, where: Record<string, unknown>): boolean {
    const w = where as {
      classSlotId?: string;
      date?: { gte?: Date; in?: Date[] };
      cancelled?: boolean;
      slot?: { seriesId?: string };
    };
    if (w.classSlotId && c.classSlotId !== w.classSlotId) return false;
    if (w.cancelled !== undefined && c.cancelled !== w.cancelled)
      return false;
    if (w.date?.gte && c.date < w.date.gte) return false;
    if (
      w.date?.in &&
      !w.date.in.some((d) => d.getTime() === c.date.getTime())
    )
      return false;
    if (w.slot?.seriesId && c.seriesId !== w.slot.seriesId) return false;
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
