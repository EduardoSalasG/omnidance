import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import type { Request } from "express";
import type { PrismaService } from "../../prisma.service";
import type { NotificationsService } from "../../notifications/domain/notifications.service";
import type { ParamsService } from "../../params/params.service";
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

interface FakePlan {
  type: string;
  weeklyClasses: number | null;
  classCount: number | null;
}

interface FakeClass {
  id: string;
  date: Date;
  cancelled: boolean;
  instructorId: string | null;
  capacity: number | null;
  slot: {
    capacity: number;
    academyId: string;
    weekday: number;
    startTime: string;
    endTime: string;
    instructorId: string | null;
    types: { type: { id: string; name: string } }[];
    series: {
      id: string;
      name: string;
      quorum: number | null;
      dropInPrice: number | null;
      instructorId: string | null;
      level: { id: string; name: string; order: number } | null;
      style: { id: string; name: string; genre: string | null } | null;
      types: { type: { id: string; name: string } }[];
    };
    academy: {
      id: string;
      name: string;
      defaultQuorum: number | null;
      billingBlockedAt: Date | null;
    };
  };
}

type FakeClassInput = Omit<Partial<FakeClass>, "slot"> & {
  slot?: Omit<Partial<FakeClass["slot"]>, "series" | "academy"> & {
    series?: Partial<FakeClass["slot"]["series"]>;
    academy?: Partial<FakeClass["slot"]["academy"]>;
  };
};

interface FakeEnrollment {
  id: string;
  personId: string;
  academyId: string;
  status: string;
  startedAt: Date;
  plan: FakePlan | null;
}

interface FakeBooking {
  id: string;
  classId: string;
  personId: string;
  status: "BOOKED" | "WAITLIST" | "CANCELLED";
  enrollmentId: string | null;
  cancelledAt: Date | null;
  refunded: boolean;
  // Orden WORKSHOP que pagó el asiento — no consume cuota.
  paymentId: string | null;
  createdAt: Date;
}

class FakePrisma {
  classes = new Map<string, FakeClass>();
  bookings: FakeBooking[] = [];
  enrollments: FakeEnrollment[] = [];
  private seq = 0;

  addClass(id: string, over: FakeClassInput = {}) {
    const { slot: overSlot, ...rest } = over;
    const {
      series: overSeries,
      academy: overAcademy,
      ...restSlot
    } = overSlot ?? {};
    this.classes.set(id, {
      id,
      date: new Date(Date.now() + 86_400_000), // mañana
      cancelled: false,
      instructorId: null,
      capacity: null,
      ...rest,
      slot: {
        capacity: 1,
        academyId: "acad-1",
        weekday: 2,
        startTime: "20:00",
        endTime: "21:00",
        instructorId: null,
        types: [],
        ...restSlot,
        series: {
          id: "ser-1",
          name: "Bachata Inicial",
          quorum: null,
          dropInPrice: null,
          instructorId: null,
          level: null,
          style: { id: "sty-1", name: "Bachata", genre: "SALSA" },
          types: [],
          ...overSeries,
        },
        academy: {
          id: "acad-1",
          name: "Academia X",
          defaultQuorum: null,
          billingBlockedAt: null,
          ...overAcademy,
        },
      },
    });
  }

  addEnrollment(
    personId: string,
    academyId = "acad-1",
    status = "ACTIVE",
    plan: FakePlan | null = null,
  ) {
    const enrollment: FakeEnrollment = {
      id: `enr-${++this.seq}`,
      personId,
      academyId,
      status,
      startedAt: new Date(Date.now() - 86_400_000),
      plan,
    };
    this.enrollments.push(enrollment);
    return enrollment.id;
  }

  addBooking(
    classId: string,
    personId: string,
    status: FakeBooking["status"],
    createdAt = new Date(),
    extra: Partial<FakeBooking> = {},
  ) {
    this.bookings.push({
      id: `bk-${++this.seq}`,
      classId,
      personId,
      status,
      enrollmentId: null,
      cancelledAt: null,
      refunded: true,
      paymentId: null,
      createdAt,
      ...extra,
    });
  }

  class = {
    // El select de detail incluye bookings/attendances como relaciones —
    // el fake las materializa desde this.bookings (Bookings de la clase
    // activas) y devuelve [] para las asistencias (no se testean acá).
    findUnique: async ({ where }: { where: { id: string } }) => {
      const c = this.classes.get(where.id);
      if (!c) return null;
      return {
        ...c,
        bookings: this.bookings
          .filter(
            (b) =>
              b.classId === c.id &&
              (b.status === "BOOKED" || b.status === "WAITLIST"),
          )
          .map((b) => ({
            personId: b.personId,
            status: b.status,
            paymentId: b.paymentId,
          })),
        attendances: [],
      };
    },
    findMany: async () => [],
  };

  person = {
    findUnique: async () => null,
  };

  enrollment = {
    findFirst: async ({
      where,
    }: {
      where: { personId: string; academyId: string; status: { in: string[] } };
    }) =>
      this.enrollments.find(
        (e) =>
          e.personId === where.personId &&
          e.academyId === where.academyId &&
          where.status.in.includes(e.status),
      ) ?? null,

    findMany: async ({
      where,
    }: {
      where: { personId: string; academyId: string; status: { in: string[] } };
    }) =>
      this.enrollments
        .filter(
          (e) =>
            e.personId === where.personId &&
            e.academyId === where.academyId &&
            where.status.in.includes(e.status),
        )
        .map((e) => ({ ...e })),
  };

  /** Matcher de where para classBooking (subset que usa el controller). */
  private bookingMatches(
    b: FakeBooking,
    where: {
      classId?: string;
      personId?: string;
      status?: string | { in: string[] };
      refunded?: boolean;
      paymentId?: string | null;
      OR?: Array<Record<string, unknown>>;
      class?: {
        date?: { gte?: Date; lt?: Date; lte?: Date };
        slot?: { academyId?: string };
      };
    },
  ): boolean {
    if (where.OR) {
      return where.OR.some((sub) =>
        this.bookingMatches(b, {
          ...where,
          OR: undefined,
          ...sub,
        } as typeof where),
      );
    }
    if (where.classId !== undefined && b.classId !== where.classId)
      return false;
    if (where.personId !== undefined && b.personId !== where.personId)
      return false;
    if (where.refunded !== undefined && b.refunded !== where.refunded)
      return false;
    if (where.paymentId !== undefined && b.paymentId !== where.paymentId)
      return false;
    if (where.status !== undefined) {
      if (typeof where.status === "string") {
        if (b.status !== where.status) return false;
      } else if (!where.status.in.includes(b.status)) return false;
    }
    if (where.class) {
      const c = this.classes.get(b.classId);
      if (!c) return false;
      const d = where.class.date;
      if (d?.gte && c.date < d.gte) return false;
      if (d?.lt && c.date >= d.lt) return false;
      if (d?.lte && c.date > d.lte) return false;
      if (where.class.slot?.academyId && c.slot.academyId !== where.class.slot.academyId)
        return false;
    }
    return true;
  }

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

    count: async ({ where }: { where: Parameters<FakePrisma["bookingMatches"]>[1] }) =>
      this.bookings.filter((b) => this.bookingMatches(b, where)).length,

    findMany: async ({
      where,
      orderBy,
    }: {
      where: Parameters<FakePrisma["bookingMatches"]>[1];
      orderBy?: { createdAt: "asc" | "desc" };
    }) => {
      const rows = this.bookings.filter((b) => this.bookingMatches(b, where));
      if (orderBy?.createdAt === "asc") {
        rows.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      }
      return rows.map((r) => ({ ...r }));
    },

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
      data: {
        classId: string;
        personId: string;
        status: FakeBooking["status"];
        enrollmentId?: string | null;
        paymentId?: string | null;
      };
    }) => {
      const row: FakeBooking = {
        id: `bk-${++this.seq}`,
        createdAt: new Date(),
        enrollmentId: null,
        cancelledAt: null,
        refunded: true,
        paymentId: null,
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

// ParamsService fake: getNumber siempre devuelve el fallback (el param
// classes.cancel_refund_minutes no existe → cutoff default de 60min).
const fakeParams = () =>
  ({
    getNumber: vi.fn(async (_key: string, fallback: number) => fallback),
  }) as unknown as ParamsService;

// Clase que empieza en `minutes` — date = medianoche UTC de ese día y
// startTime = HH:mm UTC del instante (mismo formato que Class/ClassSlot).
function classStartingIn(minutes: number) {
  const start = new Date(Date.now() + minutes * 60_000);
  const date = new Date(
    Date.UTC(
      start.getUTCFullYear(),
      start.getUTCMonth(),
      start.getUTCDate(),
    ),
  );
  const startTime = `${String(start.getUTCHours()).padStart(2, "0")}:${String(
    start.getUTCMinutes(),
  ).padStart(2, "0")}`;
  return { date, startTime };
}

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
      fakeParams(),
    );
    prisma.addClass("cls-1");
    // Regla: reservar exige inscripción vigente — per-1/per-2 inscritos,
    // per-3 queda fuera para los casos de rechazo.
    prisma.addEnrollment("per-1");
    prisma.addEnrollment("per-2");
  });

  it("sin inscripción vigente → ForbiddenException y no crea reserva", async () => {
    await expect(ctrl.book("cls-1", reqAs("per-3"))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.bookings).toHaveLength(0);
  });

  it("inscripción PAUSED no habilita reserva → ForbiddenException", async () => {
    prisma.addEnrollment("per-3", "acad-1", "PAUSED");
    await expect(ctrl.book("cls-1", reqAs("per-3"))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("inscripción TRIAL habilita reserva → BOOKED", async () => {
    prisma.addEnrollment("per-3", "acad-1", "TRIAL");
    const res = await ctrl.book("cls-1", reqAs("per-3"));
    expect(res.status).toBe("BOOKED");
  });

  it("inscripción en otra academia no habilita → ForbiddenException", async () => {
    prisma.addEnrollment("per-3", "acad-2");
    await expect(ctrl.book("cls-1", reqAs("per-3"))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
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

  it("academia bloqueada por mora → 400 academy.unavailable (S3)", async () => {
    prisma.addClass("cls-blocked", {
      slot: { academy: { billingBlockedAt: new Date() } },
    });
    const err = await ctrl
      .book("cls-blocked", reqAs("per-1"))
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    expect(
      (err as BadRequestException).getResponse(),
    ).toMatchObject({ error: "academy.unavailable" });
    expect(prisma.bookings).toHaveLength(0);
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
      fakeParams(),
    );
    prisma.addClass("cls-1"); // capacity 1
  });

  it("cancelar BOOKED promueve al primer WAITLIST (createdAt asc) y notifica", async () => {
    // La promoción re-chequea cuota → el promovido necesita inscripción
    // vigente (plan null = sin cuota — ilimitado).
    prisma.addEnrollment("per-2");
    prisma.addEnrollment("per-3");
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
    prisma.addEnrollment("per-2");
    prisma.addEnrollment("per-3");
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

describe("cuota de créditos (book)", () => {
  let prisma: FakePrisma;
  let notifications: { notifySafe: ReturnType<typeof vi.fn> };
  let ctrl: ClassesController;

  beforeEach(() => {
    prisma = new FakePrisma();
    notifications = { notifySafe: vi.fn(async () => undefined) };
    ctrl = new ClassesController(
      prisma as unknown as PrismaService,
      notifications as unknown as NotificationsService,
      {} as AcademyAccess,
      fakeParams(),
    );
    prisma.addClass("cls-1");
    prisma.addClass("cls-2"); // misma fecha → misma semana ISO
    prisma.addClass("cls-3");
  });

  it("plan 1 clase/semana con cuota agotada → 409", async () => {
    prisma.addEnrollment("per-1", "acad-1", "ACTIVE", {
      type: "MONTHLY",
      weeklyClasses: 1,
      classCount: null,
    });
    const first = await ctrl.book("cls-1", reqAs("per-1"));
    expect(first.status).toBe("BOOKED");
    await expect(ctrl.book("cls-2", reqAs("per-1"))).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(prisma.bookings).toHaveLength(1);
  });

  it("plan 2 clases/semana: segunda reserva pasa, tercera → 409", async () => {
    prisma.addEnrollment("per-1", "acad-1", "ACTIVE", {
      type: "MONTHLY",
      weeklyClasses: 2,
      classCount: null,
    });
    await ctrl.book("cls-1", reqAs("per-1"));
    await ctrl.book("cls-2", reqAs("per-1"));
    await expect(ctrl.book("cls-3", reqAs("per-1"))).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it("plan ilimitado (weeklyClasses null) nunca bloquea", async () => {
    prisma.addEnrollment("per-1", "acad-1", "ACTIVE", {
      type: "MONTHLY",
      weeklyClasses: null,
      classCount: null,
    });
    for (const id of ["cls-1", "cls-2", "cls-3"]) {
      const res = await ctrl.book(id, reqAs("per-1"));
      expect(res.status).toBe("BOOKED");
    }
  });

  it("inscripción sin plan asociado → sin cuota (legacy)", async () => {
    prisma.addEnrollment("per-1"); // plan null
    await ctrl.book("cls-1", reqAs("per-1"));
    const res = await ctrl.book("cls-2", reqAs("per-1"));
    expect(res.status).toBe("BOOKED");
  });

  it("cancelación refunded no consume: re-reserva tras refund", async () => {
    prisma.addEnrollment("per-1", "acad-1", "ACTIVE", {
      type: "MONTHLY",
      weeklyClasses: 1,
      classCount: null,
    });
    await ctrl.book("cls-1", reqAs("per-1"));
    await ctrl.cancel("cls-1", reqAs("per-1")); // clase de mañana → refunded
    const res = await ctrl.book("cls-2", reqAs("per-1"));
    expect(res.status).toBe("BOOKED");
  });

  it("cancelación tardía (refunded=false) SÍ consume: la cuota queda gastada", async () => {
    const soon = classStartingIn(30);
    prisma.addClass("cls-soon", {
      date: soon.date,
      slot: { startTime: soon.startTime },
    });
    // cls-2 el mismo día: la cuota semanal se mide por semana ISO — con
    // "mañana" el test cruzaba el corte y fallaba los domingos.
    prisma.addClass("cls-2", {
      date: soon.date,
      slot: { startTime: soon.startTime },
    });
    prisma.addEnrollment("per-1", "acad-1", "ACTIVE", {
      type: "MONTHLY",
      weeklyClasses: 1,
      classCount: null,
    });
    await ctrl.book("cls-soon", reqAs("per-1"));
    await ctrl.cancel("cls-soon", reqAs("per-1")); // <1h → refunded:false
    await expect(ctrl.book("cls-2", reqAs("per-1"))).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it("CLASS_PACK agotado → 409; pack con saldo registra enrollmentId", async () => {
    const packEnr = prisma.addEnrollment("per-1", "acad-1", "ACTIVE", {
      type: "CLASS_PACK",
      weeklyClasses: null,
      classCount: 1,
    });
    const res = await ctrl.book("cls-1", reqAs("per-1"));
    expect(res.status).toBe("BOOKED");
    expect(
      prisma.bookings.find((b) => b.id === res.id)?.enrollmentId,
    ).toBe(packEnr);
    await expect(ctrl.book("cls-2", reqAs("per-1"))).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it("con plan semanal + pack: prefiere la cuota semanal", async () => {
    const weeklyEnr = prisma.addEnrollment("per-1", "acad-1", "ACTIVE", {
      type: "MONTHLY",
      weeklyClasses: 1,
      classCount: null,
    });
    prisma.addEnrollment("per-1", "acad-1", "ACTIVE", {
      type: "CLASS_PACK",
      weeklyClasses: null,
      classCount: 5,
    });
    const res = await ctrl.book("cls-1", reqAs("per-1"));
    expect(
      prisma.bookings.find((b) => b.id === res.id)?.enrollmentId,
    ).toBe(weeklyEnr);
  });

  it("entrar a WAITLIST con cuota agotada → se acepta sin consumir", async () => {
    prisma.addEnrollment("per-9"); // ocupa el único cupo, sin cuota
    prisma.addBooking("cls-1", "per-9", "BOOKED");
    prisma.addEnrollment("per-1", "acad-1", "ACTIVE", {
      type: "MONTHLY",
      weeklyClasses: 1,
      classCount: null,
    });
    await ctrl.book("cls-2", reqAs("per-1")); // agota la cuota semanal
    const res = await ctrl.book("cls-1", reqAs("per-1"));
    expect(res.status).toBe("WAITLIST"); // no 409 — no consume hasta promover
  });
});

describe("promoción de waitlist con cuota", () => {
  let prisma: FakePrisma;
  let notifications: { notifySafe: ReturnType<typeof vi.fn> };
  let ctrl: ClassesController;

  beforeEach(() => {
    prisma = new FakePrisma();
    notifications = { notifySafe: vi.fn(async () => undefined) };
    ctrl = new ClassesController(
      prisma as unknown as PrismaService,
      notifications as unknown as NotificationsService,
      {} as AcademyAccess,
      fakeParams(),
    );
    prisma.addClass("cls-1"); // capacity 1
    prisma.addClass("cls-2");
  });

  it("salta al WAITLIST sin cuota y promueve al siguiente", async () => {
    // per-2 (primero en espera) ya gastó su única clase semanal en otra clase.
    const t0 = Date.now();
    prisma.addEnrollment("per-2", "acad-1", "ACTIVE", {
      type: "MONTHLY",
      weeklyClasses: 1,
      classCount: null,
    });
    prisma.addEnrollment("per-3"); // ilimitado
    prisma.addBooking("cls-2", "per-2", "BOOKED");
    prisma.addBooking("cls-1", "per-1", "BOOKED");
    prisma.addBooking("cls-1", "per-2", "WAITLIST", new Date(t0 - 2000));
    prisma.addBooking("cls-1", "per-3", "WAITLIST", new Date(t0 - 1000));

    await ctrl.cancel("cls-1", reqAs("per-1"));

    // per-2 ya tiene un BOOKED en cls-2 (su crédito gastado) — el assert
    // filtra por cls-1, donde está en espera.
    expect(
      prisma.bookings.find(
        (b) => b.personId === "per-2" && b.classId === "cls-1",
      )!.status,
    ).toBe("WAITLIST"); // sin cuota → queda en espera
    expect(prisma.bookings.find((b) => b.personId === "per-3")!.status).toBe(
      "BOOKED",
    );
    expect(notifications.notifySafe).toHaveBeenCalledWith(
      "per-3",
      expect.objectContaining({ type: "class.waitlist.promoted" }),
    );
  });

  it("WAITLIST sin inscripción vigente no se promueve", async () => {
    prisma.addEnrollment("per-3");
    prisma.addBooking("cls-1", "per-1", "BOOKED");
    prisma.addBooking("cls-1", "per-ghost", "WAITLIST", new Date(Date.now() - 2000));
    prisma.addBooking("cls-1", "per-3", "WAITLIST");

    await ctrl.cancel("cls-1", reqAs("per-1"));

    expect(
      prisma.bookings.find((b) => b.personId === "per-ghost")!.status,
    ).toBe("WAITLIST");
    expect(prisma.bookings.find((b) => b.personId === "per-3")!.status).toBe(
      "BOOKED",
    );
  });
});

describe("myCredits en GET /classes/:id", () => {
  let prisma: FakePrisma;
  let notifications: { notifySafe: ReturnType<typeof vi.fn> };
  let ctrl: ClassesController;

  beforeEach(() => {
    prisma = new FakePrisma();
    notifications = { notifySafe: vi.fn(async () => undefined) };
    ctrl = new ClassesController(
      prisma as unknown as PrismaService,
      notifications as unknown as NotificationsService,
      {} as AcademyAccess,
      fakeParams(),
    );
    prisma.addClass("cls-1");
  });

  it("plan semanal → myCredits con used/limit de la semana", async () => {
    prisma.addEnrollment("per-1", "acad-1", "ACTIVE", {
      type: "MONTHLY",
      weeklyClasses: 2,
      classCount: null,
    });
    prisma.addBooking("cls-1", "per-1", "BOOKED"); // 1 consumida
    const res = await ctrl.detail("cls-1", reqAs("per-1"));
    expect(res.myCredits).toEqual({ kind: "WEEKLY", used: 1, limit: 2 });
    expect(res.cancelRefundMinutes).toBe(60);
  });

  it("cuota agotada → myCredits declara used=limit (el CTA muestra 0)", async () => {
    prisma.addEnrollment("per-1", "acad-1", "ACTIVE", {
      type: "MONTHLY",
      weeklyClasses: 1,
      classCount: null,
    });
    prisma.addBooking("cls-1", "per-1", "BOOKED");
    const res = await ctrl.detail("cls-1", reqAs("per-1"));
    expect(res.myCredits).toEqual({ kind: "WEEKLY", used: 1, limit: 1 });
  });

  it("plan ilimitado o sin inscripción → myCredits null", async () => {
    prisma.addEnrollment("per-1", "acad-1", "ACTIVE", {
      type: "MONTHLY",
      weeklyClasses: null,
      classCount: null,
    });
    const res = await ctrl.detail("cls-1", reqAs("per-1"));
    expect(res.myCredits).toBeNull();

    const anon = await ctrl.detail("cls-1", reqAs("per-9"));
    expect(anon.myCredits).toBeNull();
    expect(anon.enrolled).toBe(false);
  });
});

describe("política de cancelación (cutoff 1h)", () => {
  let prisma: FakePrisma;
  let notifications: { notifySafe: ReturnType<typeof vi.fn> };
  let ctrl: ClassesController;

  beforeEach(() => {
    prisma = new FakePrisma();
    notifications = { notifySafe: vi.fn(async () => undefined) };
    ctrl = new ClassesController(
      prisma as unknown as PrismaService,
      notifications as unknown as NotificationsService,
      {} as AcademyAccess,
      fakeParams(),
    );
  });

  it("cancelar dentro de la ventana → refunded:true", async () => {
    prisma.addClass("cls-1"); // mañana → lejos del corte
    prisma.addBooking("cls-1", "per-1", "BOOKED");
    const res = await ctrl.cancel("cls-1", reqAs("per-1"));
    expect(res.status).toBe("CANCELLED");
    expect(res.refunded).toBe(true);
    const b = prisma.bookings.find((x) => x.personId === "per-1")!;
    expect(b.refunded).toBe(true);
    expect(b.cancelledAt).toBeInstanceOf(Date);
  });

  it("cancelar <1h antes del inicio → refunded:false pero libera el cupo", async () => {
    const soon = classStartingIn(30);
    prisma.addClass("cls-soon", {
      date: soon.date,
      slot: { startTime: soon.startTime },
    });
    prisma.addEnrollment("per-2"); // waitlist ilimitado
    prisma.addBooking("cls-soon", "per-1", "BOOKED");
    prisma.addBooking("cls-soon", "per-2", "WAITLIST");

    const res = await ctrl.cancel("cls-soon", reqAs("per-1"));
    expect(res.refunded).toBe(false);
    expect(prisma.bookings.find((b) => b.personId === "per-1")!.refunded).toBe(
      false,
    );
    // El asiento se libera igual — la waitlist promueve.
    expect(prisma.bookings.find((b) => b.personId === "per-2")!.status).toBe(
      "BOOKED",
    );
  });

  it("cancelar WAITLIST nunca marca refunded:false (nunca consumió)", async () => {
    prisma.addClass("cls-1");
    prisma.addBooking("cls-1", "per-1", "WAITLIST");
    const res = await ctrl.cancel("cls-1", reqAs("per-1"));
    expect(res.refunded).toBe(true);
  });

  it("asiento pagado (paymentId) → refunded:false siempre, el cupo se libera", async () => {
    prisma.addClass("cls-1");
    prisma.addEnrollment("per-2");
    prisma.addBooking("cls-1", "per-1", "BOOKED", new Date(), {
      paymentId: "pay-wk1",
    });
    prisma.addBooking("cls-1", "per-2", "WAITLIST");

    const res = await ctrl.cancel("cls-1", reqAs("per-1"));
    // No hay crédito que devolver — la devolución monetaria es manual.
    expect(res.refunded).toBe(false);
    expect(prisma.bookings.find((b) => b.personId === "per-2")!.status).toBe(
      "BOOKED",
    );
  });
});

describe("asiento pagado vs cuota del plan", () => {
  let prisma: FakePrisma;
  let notifications: { notifySafe: ReturnType<typeof vi.fn> };
  let ctrl: ClassesController;

  beforeEach(() => {
    prisma = new FakePrisma();
    notifications = { notifySafe: vi.fn(async () => undefined) };
    ctrl = new ClassesController(
      prisma as unknown as PrismaService,
      notifications as unknown as NotificationsService,
      {} as AcademyAccess,
      fakeParams(),
    );
    prisma.addClass("cls-1");
    prisma.addClass("cls-2");
  });

  it("una reserva pagada NO consume la cuota semanal", async () => {
    prisma.addEnrollment("per-1", "acad-1", "ACTIVE", {
      type: "MONTHLY",
      weeklyClasses: 1,
      classCount: null,
    });
    // Asiento comprado en cls-1 — la cuota sigue intacta.
    prisma.addBooking("cls-1", "per-1", "BOOKED", new Date(), {
      paymentId: "pay-wk1",
    });
    const res = await ctrl.book("cls-2", reqAs("per-1"));
    expect(res.status).toBe("BOOKED");
  });

  it("cuota agotada no bloquea ver la ficha: myCredits used=limit y una compra posterior no altera used", async () => {
    prisma.addEnrollment("per-1", "acad-1", "ACTIVE", {
      type: "MONTHLY",
      weeklyClasses: 1,
      classCount: null,
    });
    prisma.addBooking("cls-1", "per-1", "BOOKED"); // consume la cuota
    prisma.addBooking("cls-2", "per-1", "BOOKED", new Date(), {
      paymentId: "pay-wk2", // comprada suelta — no suma al conteo
    });
    const res = await ctrl.detail("cls-1", reqAs("per-1"));
    expect(res.myCredits).toEqual({ kind: "WEEKLY", used: 1, limit: 1 });
  });

  it("detail expone myBookingPaid cuando la reserva es una compra", async () => {
    prisma.addClass("cls-1");
    prisma.addBooking("cls-1", "per-1", "BOOKED", new Date(), {
      paymentId: "pay-wk1",
    });
    const res = await ctrl.detail("cls-1", reqAs("per-1"));
    expect(res.myBooking).toBe("BOOKED");
    expect(res.myBookingPaid).toBe(true);
  });
});
