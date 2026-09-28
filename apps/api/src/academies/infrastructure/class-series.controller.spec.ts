import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Request } from "express";
import type { PrismaService } from "../../prisma.service";
import type { NotificationsService } from "../../notifications/domain/notifications.service";
import type { AcademyAccess } from "./academy-access.service";
// Ciclo session.guard ⇄ auth.controller (ver classes.controller.spec.ts).
import "../../auth/infrastructure/auth.controller";
import { ClassSeriesController } from "./class-series.controller";

// Cascade de cancelación por la academia (spec class-credit-cancellation):
// desactivar serie / eliminar slot cancelan las clases futuras y TODAS
// las reservas activas quedan CANCELLED con refunded=true + cancelledAt —
// un alumno nunca pierde crédito por una decisión de la academia.

interface FakeCls {
  id: string;
  classSlotId: string;
  seriesId: string;
  date: Date;
  cancelled: boolean;
}

interface FakeBooking {
  id: string;
  classId: string;
  status: "BOOKED" | "WAITLIST" | "CANCELLED";
  cancelledAt: Date | null;
  refunded: boolean;
}

class FakePrisma {
  classes: FakeCls[] = [];
  bookings: FakeBooking[] = [];
  series = new Map<string, { id: string; academyId: string }>();
  slots = new Map<string, { id: string; academyId: string; seriesId: string }>();

  class = {
    findMany: async ({ where }: { where: Record<string, unknown> }) =>
      this.classes.filter((c) => {
        const w = where as {
          classSlotId?: string;
          date?: { gte?: Date };
          cancelled?: boolean;
          slot?: { seriesId?: string };
        };
        if (w.classSlotId && c.classSlotId !== w.classSlotId) return false;
        if (w.cancelled !== undefined && c.cancelled !== w.cancelled)
          return false;
        if (w.date?.gte && c.date < w.date.gte) return false;
        if (w.slot?.seriesId && c.seriesId !== w.slot.seriesId) return false;
        return true;
      }),
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
    update: async ({ where }: { where: { id: string } }) =>
      this.series.get(where.id) ?? null,
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
  };

  $transaction = async <T>(
    cb: (tx: FakePrisma) => Promise<T>,
  ): Promise<T> => cb(this);
}

const req = { person: { id: "per-admin" } } as unknown as Request;
const future = () => new Date(Date.now() + 3 * 86_400_000);

describe("ClassSeriesController — cancelación por la academia devuelve crédito", () => {
  let prisma: FakePrisma;
  let ctrl: ClassSeriesController;

  beforeEach(() => {
    prisma = new FakePrisma();
    ctrl = new ClassSeriesController(
      prisma as unknown as PrismaService,
      { requireAdminister: vi.fn(async () => undefined) } as unknown as AcademyAccess,
      { notifySafe: vi.fn() } as unknown as NotificationsService,
    );
    prisma.series.set("ser-1", { id: "ser-1", academyId: "acad-1" });
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
    expect(b1.refunded).toBe(true); // refunded siempre — nunca quema cuota
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
    expect(prisma.slots.has("slot-1")).toBe(false);
  });
});
