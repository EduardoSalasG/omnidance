import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import type { Request } from "express";
import type { PrismaService } from "../../prisma.service";
import type { NotificationsService } from "../../notifications/domain/notifications.service";
import type { AcademyAccess } from "./academy-access.service";
// Ciclo session.guard ⇄ auth.controller (SESSION_COOKIE): si session.guard
// entra primero, los @UseGuards de auth.controller evalúan con SessionGuard
// undefined. Cargar auth.controller antes rompe el ciclo a favor del test.
import "../../auth/infrastructure/auth.controller";
import { ClassesController } from "./classes.controller";

// ClassesController.book / cancel — capacidad real: cupo libre → BOOKED,
// lleno → WAITLIST (orden de llegada); al cancelar un BOOKED se promueve
// al primer WAITLIST y se notifica. PrismaService se simula in-memory;
// $transaction ejecuta el callback con el mismo fake como tx.

interface FakeClass {
  id: string;
  date: Date;
  cancelled: boolean;
  slot: {
    capacity: number;
    series: { name: string } | null;
    academy: { name: string };
  };
}

interface FakeBooking {
  id: string;
  classId: string;
  personId: string;
  status: "BOOKED" | "WAITLIST" | "CANCELLED";
  createdAt: Date;
}

class FakePrisma {
  classes = new Map<string, FakeClass>();
  bookings: FakeBooking[] = [];
  private seq = 0;

  addClass(id: string, over: Partial<FakeClass> = {}) {
    this.classes.set(id, {
      id,
      date: new Date(Date.now() + 86_400_000), // mañana
      cancelled: false,
      slot: {
        capacity: 1,
        series: { name: "Bachata Inicial" },
        academy: { name: "Academia X" },
        ...over.slot,
      },
      ...over,
    });
  }

  addBooking(
    classId: string,
    personId: string,
    status: FakeBooking["status"],
    createdAt = new Date(),
  ) {
    this.bookings.push({
      id: `bk-${++this.seq}`,
      classId,
      personId,
      status,
      createdAt,
    });
  }

  class = {
    findUnique: async ({ where }: { where: { id: string } }) =>
      this.classes.get(where.id) ?? null,
  };

  classBooking = {
    // Devuelve copias — como Prisma, cada lectura es un snapshot detached;
    // si se devolviera la fila viva, un update mutaría snapshots anteriores
    // (p.ej. cancel lee booking.status tras el update a CANCELLED).
    findUnique: async ({
      where,
    }: {
      where: { classId_personId: { classId: string; personId: string } };
    }) => {
      const row = this.bookings.find(
        (b) =>
          b.classId === where.classId_personId.classId &&
          b.personId === where.classId_personId.personId,
      );
      return row ? { ...row } : null;
    },

    count: async ({
      where,
    }: {
      where: { classId: string; status: string };
    }) =>
      this.bookings.filter(
        (b) => b.classId === where.classId && b.status === where.status,
      ).length,

    findFirst: async ({
      where,
      orderBy,
    }: {
      where: { classId: string; status: string };
      orderBy?: { createdAt: "asc" | "desc" };
    }) => {
      const rows = this.bookings.filter(
        (b) => b.classId === where.classId && b.status === where.status,
      );
      if (orderBy?.createdAt === "asc") {
        rows.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      }
      return rows[0] ? { ...rows[0] } : null;
    },

    create: async ({
      data,
    }: {
      data: { classId: string; personId: string; status: FakeBooking["status"] };
    }) => {
      const row: FakeBooking = {
        id: `bk-${++this.seq}`,
        createdAt: new Date(),
        ...data,
      };
      this.bookings.push(row);
      return { ...row };
    },

    update: async ({
      where,
      data,
    }: {
      where: { id: string };
      data: Partial<FakeBooking>;
    }) => {
      const row = this.bookings.find((b) => b.id === where.id);
      if (!row) throw new Error("booking no encontrado");
      Object.assign(row, data);
      return { ...row };
    },
  };

  // El controller transacciona; el fake ejecuta el callback consigo mismo.
  $transaction = async <T>(
    cb: (tx: FakePrisma) => Promise<T>,
  ): Promise<T> => cb(this);
}

const reqAs = (personId: string) =>
  ({ person: { id: personId } }) as unknown as Request;

describe("ClassesController.book", () => {
  let prisma: FakePrisma;
  let notifications: { notifySafe: ReturnType<typeof vi.fn> };
  let ctrl: ClassesController;

  beforeEach(() => {
    prisma = new FakePrisma();
    notifications = { notifySafe: vi.fn(async () => undefined) };
    ctrl = new ClassesController(
      prisma as unknown as PrismaService,
      notifications as unknown as NotificationsService,
      {} as AcademyAccess, // book/cancel no lo usan
    );
    prisma.addClass("cls-1");
  });

  it("con cupo libre → BOOKED", async () => {
    const res = await ctrl.book("cls-1", reqAs("per-1"));
    expect(res.status).toBe("BOOKED");
    expect(res.classId).toBe("cls-1");
    expect(res.personId).toBe("per-1");
  });

  it("cupo lleno → WAITLIST (no rechaza)", async () => {
    await ctrl.book("cls-1", reqAs("per-1")); // capacity 1
    const res = await ctrl.book("cls-1", reqAs("per-2"));
    expect(res.status).toBe("WAITLIST");
  });

  it("doble booking (BOOKED o WAITLIST) → 409 ConflictException", async () => {
    await ctrl.book("cls-1", reqAs("per-1"));
    await expect(ctrl.book("cls-1", reqAs("per-1"))).rejects.toBeInstanceOf(
      ConflictException,
    );
    await ctrl.book("cls-1", reqAs("per-2")); // WAITLIST
    await expect(ctrl.book("cls-1", reqAs("per-2"))).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(prisma.bookings).toHaveLength(2);
  });

  it("re-reservar una reserva CANCELLED reactiva la misma fila", async () => {
    await ctrl.book("cls-1", reqAs("per-1"));
    const cancelled = await ctrl.cancel("cls-1", reqAs("per-1"));
    const res = await ctrl.book("cls-1", reqAs("per-1"));
    expect(res.id).toBe(cancelled.id);
    expect(res.status).toBe("BOOKED");
    expect(prisma.bookings).toHaveLength(1);
  });

  it("clase inexistente → NotFoundException", async () => {
    await expect(ctrl.book("cls-x", reqAs("per-1"))).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("clase cancelada → BadRequestException", async () => {
    prisma.addClass("cls-c", { cancelled: true });
    await expect(ctrl.book("cls-c", reqAs("per-1"))).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("clase pasada → BadRequestException", async () => {
    prisma.addClass("cls-old", { date: new Date(Date.now() - 86_400_000) });
    await expect(ctrl.book("cls-old", reqAs("per-1"))).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

describe("ClassesController.cancel", () => {
  let prisma: FakePrisma;
  let notifications: { notifySafe: ReturnType<typeof vi.fn> };
  let ctrl: ClassesController;

  beforeEach(() => {
    prisma = new FakePrisma();
    notifications = { notifySafe: vi.fn(async () => undefined) };
    ctrl = new ClassesController(
      prisma as unknown as PrismaService,
      notifications as unknown as NotificationsService,
      {} as AcademyAccess, // book/cancel no lo usan
    );
    prisma.addClass("cls-1"); // capacity 1
  });

  it("cancelar BOOKED promueve al primer WAITLIST (createdAt asc) y notifica", async () => {
    prisma.addBooking("cls-1", "per-1", "BOOKED");
    const t0 = Date.now();
    prisma.addBooking("cls-1", "per-2", "WAITLIST", new Date(t0 - 2000));
    prisma.addBooking("cls-1", "per-3", "WAITLIST", new Date(t0 - 1000));

    const res = await ctrl.cancel("cls-1", reqAs("per-1"));
    expect(res.status).toBe("CANCELLED");

    const per2 = prisma.bookings.find((b) => b.personId === "per-2")!;
    const per3 = prisma.bookings.find((b) => b.personId === "per-3")!;
    expect(per2.status).toBe("BOOKED"); // el más antiguo en espera
    expect(per3.status).toBe("WAITLIST"); // el resto sigue en espera

    expect(notifications.notifySafe).toHaveBeenCalledTimes(1);
    expect(notifications.notifySafe).toHaveBeenCalledWith(
      "per-2",
      expect.objectContaining({
        type: "class.waitlist.promoted",
        data: { classId: "cls-1", bookingId: per2.id },
      }),
    );
  });

  it("cancelar WAITLIST no promueve a nadie ni notifica", async () => {
    prisma.addBooking("cls-1", "per-1", "BOOKED");
    prisma.addBooking("cls-1", "per-2", "WAITLIST");
    prisma.addBooking("cls-1", "per-3", "WAITLIST");

    await ctrl.cancel("cls-1", reqAs("per-2"));

    expect(prisma.bookings.find((b) => b.personId === "per-2")!.status).toBe(
      "CANCELLED",
    );
    expect(prisma.bookings.find((b) => b.personId === "per-3")!.status).toBe(
      "WAITLIST",
    );
    expect(notifications.notifySafe).not.toHaveBeenCalled();
  });

  it("cancelar BOOKED sin nadie en espera no notifica", async () => {
    prisma.addBooking("cls-1", "per-1", "BOOKED");
    await ctrl.cancel("cls-1", reqAs("per-1"));
    expect(notifications.notifySafe).not.toHaveBeenCalled();
  });

  it("sin reserva activa → NotFoundException", async () => {
    await expect(ctrl.cancel("cls-1", reqAs("ghost"))).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("reserva ya CANCELLED → NotFoundException", async () => {
    prisma.addBooking("cls-1", "per-1", "CANCELLED");
    await expect(ctrl.cancel("cls-1", reqAs("per-1"))).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
