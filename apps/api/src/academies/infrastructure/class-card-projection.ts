import { effectiveCapacity } from "../domain/academy.service";

// Proyección completa del card de clase — la consumen browse, mine
// (reservadas), el historial, el perfil público de academia y el home
// (myClasses/nextClass); misma shape que ClassCardData en web.
export const CLASS_CARD_SELECT = {
  id: true,
  date: true,
  instructorId: true,
  capacity: true,
  slot: {
    select: {
      weekday: true,
      startTime: true,
      endTime: true,
      capacity: true,
      types: {
        include: { type: { select: { id: true, name: true } } },
      },
      academy: {
        select: { id: true, name: true, defaultQuorum: true },
      },
      series: {
        select: {
          id: true,
          name: true,
          quorum: true,
          dropInPrice: true,
          level: { select: { id: true, name: true, order: true } },
          style: { select: { id: true, name: true, genre: true } },
          types: {
            include: { type: { select: { id: true, name: true } } },
          },
        },
      },
    },
  },
  bookings: {
    where: { status: { in: ["BOOKED", "WAITLIST"] as string[] } },
    select: { personId: true, status: true },
  },
} as const;

// Instante UTC en que termina la clase: Class.date es medianoche UTC
// del día calendario local y slot.endTime es "HH:MM" en hora de Chile.
// El offset Santiago↔UTC (-3/-4 DST) se deriva con Intl — sin librería.
export function classEndInstant(date: Date, endTime: string): Date {
  const ymd = date.toISOString().slice(0, 10);
  const probe = new Date(`${ymd}T12:00:00Z`); // mediodía: lejos de bordes DST
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(probe);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)!.value);
  const localAsUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  const offsetMs = localAsUtc - probe.getTime();
  return new Date(Date.parse(`${ymd}T${endTime}:00Z`) - offsetMs);
}

// ¿La clase ya se cerró? — terminó su horario (la frontera que separa
// "reservada" de "historial": una clase de HOY a las 20:00 sigue activa
// aunque Class.date (medianoche UTC) ya quedó en el pasado).
export function classEnded(c: {
  date: Date;
  slot: { endTime: string };
}): boolean {
  return classEndInstant(c.date, c.slot.endTime).getTime() <= Date.now();
}

export type ClassCardRow = {
  id: string;
  date: Date;
  instructorId: string | null;
  capacity: number | null;
  slot: {
    weekday: number;
    startTime: string;
    endTime: string;
    capacity: number | null;
    types: { type: { id: string; name: string } }[];
    academy: { id: string; name: string; defaultQuorum: number | null };
    series: {
      id: string;
      name: string;
      quorum: number | null;
      dropInPrice: number | null;
      level: { id: string; name: string; order: number } | null;
      style: { id: string; name: string; genre: string | null } | null;
      types: { type: { id: string; name: string } }[];
    };
  };
  bookings: { personId: string; status: string }[];
};

export function classCardItem(
  c: ClassCardRow,
  me: string,
  enrolledIds: Set<string>,
  instructorName: Map<string, string | null>,
) {
  const booked = c.bookings.filter((b) => b.status === "BOOKED").length;
  const mine = c.bookings.find((b) => b.personId === me);
  // Quórum efectivo ya resuelto: class → slot → serie → academia → 20.
  const capacity = effectiveCapacity({
    classCapacity: c.capacity,
    slotCapacity: c.slot.capacity,
    seriesQuorum: c.slot.series.quorum,
    academyDefaultQuorum: c.slot.academy.defaultQuorum,
  });
  return {
    id: c.id,
    date: c.date,
    startTime: c.slot.startTime,
    endTime: c.slot.endTime,
    weekday: c.slot.weekday,
    capacity,
    bookedCount: booked,
    spotsLeft: Math.max(capacity - booked, 0),
    waitlistCount: c.bookings.filter((b) => b.status === "WAITLIST")
      .length,
    myBooking: mine?.status ?? null,
    enrolled: enrolledIds.has(c.slot.academy.id),
    academy: c.slot.academy,
    instructor: c.instructorId
      ? {
          id: c.instructorId,
          name: instructorName.get(c.instructorId) ?? null,
        }
      : null,
    series: {
      id: c.slot.series.id,
      name: c.slot.series.name,
      level: c.slot.series.level,
      style: c.slot.series.style,
      dropInPrice: c.slot.series.dropInPrice,
      // Modalidad efectiva: el horario propio gana sobre la serie
      // (slot.types vacío = hereda series.types).
      types: (c.slot.types.length ? c.slot.types : c.slot.series.types).map(
        (t) => t.type,
      ),
    },
  };
}
