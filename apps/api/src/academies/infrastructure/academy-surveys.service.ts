import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma.service";
import { NotificationsService } from "../../notifications/domain/notifications.service";

/**
 * Encuestas mensuales de curso (spec academy-console-v3): el día 1 de
 * cada mes se fan-outea una notificación a cada alumno que asistió a ≥1
 * clase de una serie el mes anterior y aún no la evaluó. Los resultados
 * son privados del owner (GET /academies/:id/surveys) y siempre
 * agregados - la identidad del evaluador nunca se expone.
 */

// "YYYY-MM" del mes calendario anterior en UTC.
export function prevMonthKey(now = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  d.setUTCMonth(d.getUTCMonth() - 1);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

// Rango [gte, lt) del mes "YYYY-MM" en UTC (para filtrar Class.date).
export function monthRange(month: string): { gte: Date; lt: Date } {
  const [y, m] = month.split("-").map(Number);
  return {
    gte: new Date(Date.UTC(y, m - 1, 1)),
    lt: new Date(Date.UTC(y, m, 1)),
  };
}

@Injectable()
export class AcademySurveysService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Fan-out mensual: notifica a cada alumno las series que cursó el mes
   * pasado y aún no evalúa. Una notificación por serie (el alumno con
   * varias series recibe varias - cada encuesta es por curso).
   * Idempotente: corre la unique personId+seriesId+month.
   */
  async runMonthly(): Promise<{ notified: number }> {
    const month = prevMonthKey();
    const { gte, lt } = monthRange(month);
    const attendances = await this.prisma.attendance.findMany({
      where: { class: { date: { gte, lt }, cancelled: false } },
      select: {
        personId: true,
        class: {
          select: {
            slot: {
              select: {
                seriesId: true,
                academyId: true,
                series: { select: { name: true } },
              },
            },
          },
        },
      },
    });
    // Distinct alumno × serie del mes.
    const pairs = new Map<
      string,
      { personId: string; seriesId: string; academyId: string; seriesName: string }
    >();
    for (const a of attendances) {
      const s = a.class.slot;
      if (!s.seriesId) continue;
      pairs.set(`${a.personId}:${s.seriesId}`, {
        personId: a.personId,
        seriesId: s.seriesId,
        academyId: s.academyId,
        seriesName: s.series?.name ?? "Clase",
      });
    }
    if (pairs.size === 0) return { notified: 0 };
    const submitted = await this.prisma.courseSurvey.findMany({
      where: {
        month,
        personId: { in: [...new Set([...pairs.values()].map((p) => p.personId))] },
        seriesId: { in: [...new Set([...pairs.values()].map((p) => p.seriesId))] },
      },
      select: { personId: true, seriesId: true },
    });
    const done = new Set(submitted.map((s) => `${s.personId}:${s.seriesId}`));
    let notified = 0;
    for (const pair of pairs.values()) {
      if (done.has(`${pair.personId}:${pair.seriesId}`)) continue;
      notified++;
      await this.notifications.notifySafe(pair.personId, {
        category: "OPERATIONAL",
        type: "academy.courseSurvey",
        title: "Cuéntanos cómo estuvo tu curso",
        body: pair.seriesName,
        data: {
          academyId: pair.academyId,
          seriesId: pair.seriesId,
          month,
        },
      });
    }
    return { notified };
  }
}
