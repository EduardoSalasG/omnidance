import { describe, it, expect, beforeEach, vi } from "vitest";
import type { PrismaService } from "../../prisma.service";
import type { NotificationsService } from "../../notifications/domain/notifications.service";
import { ClassRemindersService } from "./class-reminders.service";

// Recordatorios de clase (spec academies/class-series): a 30 y 10
// minutos del inicio real notifica al plantel (primario + co-profes +
// default de serie) y a alumnos con reserva BOOKED. Dedupe por
// (personId, classId, minutes) contra Notification existente.

const MIN = 60_000;
const NOW = new Date("2026-11-02T20:00:00Z"); // lunes

interface FakeClass {
  id: string;
  date: Date;
  cancelled: boolean;
  instructorId: string | null;
  instructors: { personId: string }[];
  bookings: { personId: string; status: string }[];
  slot: {
    startTime: string;
    instructorId: string | null;
    instructors: { personId: string }[];
    academy: { name: string };
    series: {
      name: string;
      instructorId: string | null;
      level: { name: string } | null;
    };
  };
}

/** Clase que empieza en `minutes` respecto de NOW (date = medianoche
    UTC del día, startTime = HH:mm UTC - mismo formato del modelo). */
function classStartingIn(minutes: number, over: Partial<FakeClass> = {}) {
  const start = new Date(NOW.getTime() + minutes * MIN);
  const date = new Date(
    Date.UTC(
      start.getUTCFullYear(),
      start.getUTCMonth(),
      start.getUTCDate(),
    ),
  );
  const hh = String(start.getUTCHours()).padStart(2, "0");
  const mm = String(start.getUTCMinutes()).padStart(2, "0");
  const { slot: overSlot, ...rest } = over;
  return {
    id: "cls-1",
    date,
    cancelled: false,
    instructorId: null,
    instructors: [],
    bookings: [],
    ...rest,
    slot: {
      startTime: `${hh}:${mm}`,
      instructorId: "inst-1",
      instructors: [],
      academy: { name: "Mambo Madness" },
      series: {
        name: "Mambo On2",
        instructorId: null,
        level: { name: "Intermedio" },
      },
      ...overSlot,
    },
  };
}

function makeService(
  classes: FakeClass[],
  existing: { personId: string; data: unknown }[] = [],
) {
  const prisma = {
    class: {
      // El where real filtra cancelled + rango de fechas, y el select
      // anidado trae solo reservas BOOKED - el fake aplica ambas (el
      // rango lo ejercita la lógica de ventana del propio servicio).
      findMany: vi.fn(async () =>
        classes
          .filter((c) => !c.cancelled)
          .map((c) => ({
            ...c,
            bookings: c.bookings.filter((b) => b.status === "BOOKED"),
          })),
      ),
    },
    notification: {
      findMany: vi.fn(async () =>
        existing.map((n) => ({ personId: n.personId, data: n.data })),
      ),
    },
  } as unknown as PrismaService;
  // El mock queda tipado como Mock para las assertions; el cast al
  // servicio real solo ocurre en el constructor.
  const notifications = {
    notifySafe: vi.fn(async (_personId: string, _input: unknown) => {}),
  };
  return {
    svc: new ClassRemindersService(
      prisma,
      notifications as unknown as NotificationsService,
    ),
    notifications,
  };
}

const notified = (
  notifications: { notifySafe: ReturnType<typeof vi.fn> },
  personId: string,
  minutes: number,
) =>
  notifications.notifySafe.mock.calls.some(
    (c) =>
      c[0] === personId &&
      (c[1] as { data: { minutes: number } }).data.minutes === minutes,
  );

describe("ClassRemindersService.runSweep", () => {
  beforeEach(() => vi.clearAllMocks());

  it("clase en 25min → aviso de 30min a instructor y alumno BOOKED", async () => {
    const { svc, notifications } = makeService([
      classStartingIn(25, {
        bookings: [{ personId: "per-1", status: "BOOKED" }],
      }),
    ]);
    const res = await svc.runSweep(NOW);
    expect(res.sent).toBe(2);
    // Copy pedido: "Faltan 30 minutos para tu clase {Serie} {Nivel} en {Academia}".
    expect(notifications.notifySafe).toHaveBeenCalledWith(
      "inst-1",
      expect.objectContaining({
        type: "class.reminder",
        title: "Faltan 30 minutos para tu clase",
        body: "Mambo On2 Intermedio en Mambo Madness",
        data: expect.objectContaining({ classId: "cls-1", minutes: 30 }),
      }),
    );
    expect(notifications.notifySafe).toHaveBeenCalledWith(
      "per-1",
      expect.objectContaining({ type: "class.reminder" }),
    );
    // El alumno apunta a la ficha pública; el instructor a su roster.
    const studentCall = notifications.notifySafe.mock.calls.find(
      (c) => c[0] === "per-1",
    )!;
    expect((studentCall[1] as { data: { url: string } }).data.url).toBe(
      "/clases/cls-1",
    );
  });

  it("clase en 8min → aviso de 10min (y el de 30 si no salió antes)", async () => {
    const { svc, notifications } = makeService([
      classStartingIn(8, {
        bookings: [{ personId: "per-1", status: "BOOKED" }],
      }),
    ]);
    await svc.runSweep(NOW);
    expect(notified(notifications, "inst-1", 10)).toBe(true);
    // El de 30 también se emite si el barrido anterior no lo cubrió.
    expect(notified(notifications, "inst-1", 30)).toBe(true);
  });

  it("clase en 35min → fuera del horizonte, no avisa", async () => {
    const { svc, notifications } = makeService([classStartingIn(35)]);
    const res = await svc.runSweep(NOW);
    expect(res.sent).toBe(0);
    expect(notifications.notifySafe).not.toHaveBeenCalled();
  });

  it("clase ya iniciada → no avisa", async () => {
    const { svc, notifications } = makeService([classStartingIn(-5)]);
    const res = await svc.runSweep(NOW);
    expect(res.sent).toBe(0);
    expect(notifications.notifySafe).not.toHaveBeenCalled();
  });

  it("WAITLIST y clase cancelada no generan aviso", async () => {
    const { svc, notifications } = makeService([
      classStartingIn(20, {
        bookings: [
          { personId: "per-1", status: "BOOKED" },
          { personId: "per-2", status: "WAITLIST" },
        ],
      }),
      classStartingIn(20, { id: "cls-cx", cancelled: true }),
    ]);
    await svc.runSweep(NOW);
    expect(notified(notifications, "per-1", 30)).toBe(true);
    expect(notified(notifications, "per-2", 30)).toBe(false);
  });

  it("dedupe: una Notification existente (classId+minutes) no se repite", async () => {
    const { svc, notifications } = makeService(
      [classStartingIn(20, { bookings: [] })],
      [
        {
          personId: "inst-1",
          data: { classId: "cls-1", minutes: 30 },
        },
      ],
    );
    const res = await svc.runSweep(NOW);
    expect(res.sent).toBe(0);
    expect(notifications.notifySafe).not.toHaveBeenCalled();
  });

  it("notificación de OTRO offset no tapa la nueva (30 ≠ 10)", async () => {
    const { svc, notifications } = makeService(
      [classStartingIn(8, { bookings: [] })],
      [
        {
          personId: "inst-1",
          data: { classId: "cls-1", minutes: 30 },
        },
      ],
    );
    await svc.runSweep(NOW);
    // Ya fue el de 30; queda solo el de 10.
    expect(notified(notifications, "inst-1", 30)).toBe(false);
    expect(notified(notifications, "inst-1", 10)).toBe(true);
  });

  it("co-instructor del slot y default de serie también avisan", async () => {
    const cls = classStartingIn(20, {
      slot: {
        startTime: "20:20",
        instructorId: "inst-1",
        instructors: [{ personId: "inst-2" }],
        academy: { name: "Mambo Madness" },
        series: {
          name: "Mambo On2",
          instructorId: "inst-3",
          level: { name: "Intermedio" },
        },
      },
    });
    const { svc, notifications } = makeService([cls]);
    await svc.runSweep(NOW);
    for (const p of ["inst-1", "inst-2", "inst-3"]) {
      expect(notified(notifications, p, 30)).toBe(true);
    }
    // Tres destinatarios del mismo plantel - el sweep los cubre todos.
    expect(notifications.notifySafe).toHaveBeenCalledTimes(3);
  });

  it("un fallo de notifySafe no aborta el barrido", async () => {
    const { svc, notifications } = makeService([
      classStartingIn(20, {
        bookings: [
          { personId: "per-1", status: "BOOKED" },
          { personId: "per-2", status: "BOOKED" },
        ],
      }),
    ]);
    (notifications.notifySafe as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error("push down"))
      .mockResolvedValue(undefined);
    const res = await svc.runSweep(NOW);
    // inst-1 falló; los dos alumnos igual reciben.
    expect(res.sent).toBe(2);
  });
});
