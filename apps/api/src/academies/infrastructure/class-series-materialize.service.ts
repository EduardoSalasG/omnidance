import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma.service";

type SlotLike = { id: string; weekday: number; instructorId: string | null };

/**
 * Materialización de instancias Class a partir de los horarios
 * (ClassSlot) de las series activas (spec academies/class-series): la
 * serie es ilimitada hasta desactivarse - las clases viven en una
 * ventana rodante hoy UTC → fin del mes siguiente, mantenida por el job
 * diario `academies.class_materialization` y re-materializada al crear
 * la serie, agregar slots o reactivarla.
 *
 * La operación es idempotente: descancela las clases existentes de la
 * ventana y crea solo las fechas faltantes (nunca duplica slot+date).
 */
@Injectable()
export class AcademyMaterializeService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Ventana rodante de materialización: hoy UTC → último día del mes
   * siguiente (ambos inclusive, medianoche UTC - la misma convención de
   * Class.date).
   */
  rollingDates(now = new Date()): Date[] {
    const start = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    // Día 0 del mes +2 = último día del mes siguiente.
    const end = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 2, 0),
    );
    const out: Date[] = [];
    for (let t = start.getTime(); t <= end.getTime(); t += 86_400_000) {
      out.push(new Date(t));
    }
    return out;
  }

  /**
   * Materializa instancias Class de un slot para las fechas dadas:
   * descancela las existentes y crea solo las faltantes (sin duplicar
   * slot+date). getUTCDay - las fechas vienen a medianoche UTC.
   * Devuelve contadores para el meta del job.
   */
  async materializeSlot(
    tx: Prisma.TransactionClient | PrismaService,
    slot: SlotLike,
    dates: Date[],
  ): Promise<{ created: number; revived: number }> {
    const wanted = dates.filter((d) => d.getUTCDay() === slot.weekday);
    if (!wanted.length) return { created: 0, revived: 0 };
    const existing = await tx.class.findMany({
      where: { classSlotId: slot.id, date: { in: wanted } },
      select: { id: true, date: true, cancelled: true },
    });
    const byTime = new Map(existing.map((c) => [c.date.getTime(), c]));
    const toRevive = existing.filter((c) => c.cancelled).map((c) => c.id);
    if (toRevive.length) {
      await tx.class.updateMany({
        where: { id: { in: toRevive } },
        data: { cancelled: false },
      });
    }
    const missing = wanted.filter((d) => !byTime.has(d.getTime()));
    if (missing.length) {
      await tx.class.createMany({
        data: missing.map((date) => ({
          classSlotId: slot.id,
          date,
          instructorId: slot.instructorId,
        })),
      });
    }
    return { created: missing.length, revived: toRevive.length };
  }

  /**
   * Job diario: extiende la ventana rodante de todos los slots de series
   * activas. Inactivas no generan clases nuevas (la serie muere cuando
   * el owner la desactiva, no al virar el mes).
   */
  async runDaily(): Promise<Record<string, unknown>> {
    const slots = await this.prisma.classSlot.findMany({
      where: { series: { active: true } },
      select: { id: true, weekday: true, instructorId: true },
    });
    const dates = this.rollingDates();
    let created = 0;
    let revived = 0;
    for (const slot of slots) {
      const r = await this.materializeSlot(this.prisma, slot, dates);
      created += r.created;
      revived += r.revived;
    }
    return { slots: slots.length, created, revived };
  }
}

/** Días calendario del mes "YYYY-MM" (UTC) para materializar clases. */
export function monthDates(month: string): Date[] {
  const [y, m] = month.split("-").map(Number);
  if (!y || !m || m < 1 || m > 12) return [];
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from(
    { length: days },
    (_, i) => new Date(Date.UTC(y, m - 1, i + 1)),
  );
}
