import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import type { PrismaService } from "../../prisma.service";
import type { NotificationsService } from "../../notifications/domain/notifications.service";
import {
  AcademySurveysService,
  monthRange,
  prevMonthKey,
} from "./academy-surveys.service";

// Encuestas mensuales de curso (spec academy-console-v3): el job del
// día 1 notifica una vez por alumno × serie cursada el mes anterior;
// las ya respondidas no se re-notifican (unique personId+seriesId+month).

interface FakeAttendance {
  personId: string;
  class: {
    date: Date;
    cancelled: boolean;
    slot: {
      seriesId: string | null;
      academyId: string;
      series: { name: string } | null;
    };
  };
}

class FakePrisma {
  attendances: FakeAttendance[] = [];
  surveys: { personId: string; seriesId: string; month: string }[] = [];

  attendance = {
    findMany: async ({ where }: { where: { class: { date: { gte: Date; lt: Date } } } }) =>
      this.attendances.filter(
        (a) =>
          a.class.date >= where.class.date.gte &&
          a.class.date < where.class.date.lt &&
          !a.class.cancelled,
      ),
  };

  courseSurvey = {
    findMany: async ({ where }: { where: { month: string } }) =>
      this.surveys.filter((s) => s.month === where.month),
  };
}

function att(
  personId: string,
  seriesId: string | null,
  day: number,
  opts: { cancelled?: boolean; academyId?: string } = {},
): FakeAttendance {
  // Día dentro del mes anterior a "now" fijado en el spec.
  return {
    personId,
    class: {
      date: new Date(Date.UTC(2026, 8, day)), // septiembre 2026
      cancelled: opts.cancelled ?? false,
      slot: {
        seriesId,
        academyId: opts.academyId ?? "ac-1",
        series: seriesId ? { name: `Serie ${seriesId}` } : null,
      },
    },
  };
}

describe("AcademySurveysService", () => {
  let prisma: FakePrisma;
  let notified: { personId: string; type: string; data: unknown }[];
  let service: AcademySurveysService;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.UTC(2026, 9, 1, 12))); // 1 oct 2026
    prisma = new FakePrisma();
    notified = [];
    const notifications = {
      notifySafe: async (
        personId: string,
        input: { type: string; data?: unknown },
      ) => {
        notified.push({ personId, type: input.type, data: input.data });
      },
    } as unknown as NotificationsService;
    service = new AcademySurveysService(
      prisma as unknown as PrismaService,
      notifications,
    );
  });

  afterEach(() => vi.useRealTimers());

  it("notifica una vez por alumno × serie del mes anterior", async () => {
    prisma.attendances.push(
      att("p1", "s1", 5),
      att("p1", "s1", 12), // misma serie, misma semana - dedupe
      att("p1", "s2", 10),
      att("p2", "s1", 5),
    );
    const out = await service.runMonthly();
    expect(out).toEqual({ notified: 3 });
    const keys = notified
      .map((n) => `${n.personId}:${(n.data as { seriesId: string }).seriesId}`)
      .sort();
    expect(keys).toEqual(["p1:s1", "p1:s2", "p2:s1"]);
    expect(notified[0].type).toBe("academy.courseSurvey");
    expect((notified[0].data as { month: string }).month).toBe("2026-09");
  });

  it("no re-notifica encuestas ya respondidas", async () => {
    prisma.attendances.push(att("p1", "s1", 5), att("p2", "s1", 5));
    prisma.surveys.push({ personId: "p1", seriesId: "s1", month: "2026-09" });
    const out = await service.runMonthly();
    expect(out).toEqual({ notified: 1 });
    expect(notified[0].personId).toBe("p2");
  });

  it("ignora clases canceladas y clases sin serie", async () => {
    prisma.attendances.push(
      att("p1", "s1", 5, { cancelled: true }),
      att("p2", null, 6), // clase ad-hoc sin serie
      att("p3", "s9", 20), // fuera? no - 20 sep sí entra
    );
    const out = await service.runMonthly();
    expect(out).toEqual({ notified: 1 });
    expect(notified[0].personId).toBe("p3");
  });

  it("sin asistencias del mes anterior → no notifica nada", async () => {
    // Asistencia del mes ACTUAL (octubre) - no entra en la ventana.
    prisma.attendances.push({
      personId: "p1",
      class: {
        date: new Date(Date.UTC(2026, 9, 2)),
        cancelled: false,
        slot: { seriesId: "s1", academyId: "ac-1", series: { name: "S" } },
      },
    });
    const out = await service.runMonthly();
    expect(out).toEqual({ notified: 0 });
    expect(notified).toHaveLength(0);
  });
});

describe("month helpers", () => {
  it("prevMonthKey cruza de año", () => {
    expect(prevMonthKey(new Date(Date.UTC(2026, 0, 15)))).toBe("2025-12");
  });
  it("monthRange cubre el mes completo", () => {
    const { gte, lt } = monthRange("2026-09");
    expect(gte.toISOString()).toBe("2026-09-01T00:00:00.000Z");
    expect(lt.toISOString()).toBe("2026-10-01T00:00:00.000Z");
  });
});
