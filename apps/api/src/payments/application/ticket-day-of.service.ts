import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../prisma.service";
import { NotificationsService } from "../../notifications/domain/notifications.service";

const CL_TZ = "America/Santiago";
const DAY_MS = 24 * 60 * 60 * 1000;

/** Rango UTC [desde, hasta) del día calendario CL que contiene `now`. */
export function clDayBounds(now: Date): [Date, Date] {
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone: CL_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const [y, m, d] = ymd.split("-").map(Number);
  const utcMidnight = Date.UTC(y, m - 1, d);
  const clLocal = new Date(
    new Date(utcMidnight).toLocaleString("en-US", { timeZone: CL_TZ }),
  ).getTime();
  const start = new Date(utcMidnight - (clLocal - utcMidnight));
  return [start, new Date(start.getTime() + DAY_MS)];
}

/**
 * Push day-of (spec wallet-passes): el día del evento notifica a cada
 * dueño de ticket ACTIVE - la entrada "aparece" el día D vía push que
 * aterriza en /qr (la credencial sigue siendo el QR personal rotativo;
 * no hay QR por entrada).
 *
 * Dedup por (persona, evento, día): antes de notificar busca una
 * Notification `ticket.day_of` del mismo día CL con data.eventId igual.
 * El barrido es reentrante - si el proceso cae a mitad del fan-out, el
 * siguiente run solo completa los que faltaron.
 */
@Injectable()
export class TicketDayOfService {
  private readonly logger = new Logger(TicketDayOfService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async runDaily(now = new Date()): Promise<{ events: number; notified: number }> {
    const [from, to] = clDayBounds(now);
    const events = await this.prisma.event.findMany({
      where: {
        startsAt: { gte: from, lt: to },
        status: { in: ["PUBLISHED", "LIVE"] },
      },
      select: { id: true, name: true },
    });
    if (!events.length) return { events: 0, notified: 0 };

    const byId = new Map(events.map((e) => [e.id, e]));
    const tickets = await this.prisma.ticket.findMany({
      where: { eventId: { in: events.map((e) => e.id) }, status: "ACTIVE" },
      select: { ownerId: true, eventId: true },
    });

    let notified = 0;
    for (const t of tickets) {
      const event = byId.get(t.eventId);
      if (!event) continue;
      const sent = await this.prisma.notification.findFirst({
        where: {
          personId: t.ownerId,
          type: "ticket.day_of",
          createdAt: { gte: from },
          data: { path: ["eventId"], equals: t.eventId },
        },
        select: { id: true },
      });
      if (sent) continue;
      await this.notifications.notifySafe(t.ownerId, {
        category: "SOCIAL",
        type: "ticket.day_of",
        title: `Hoy: ${event.name}`,
        body: "Tu entrada está lista - muestra tu QR en la puerta.",
        data: { eventId: t.eventId, url: "/qr" },
      });
      notified++;
    }
    this.logger.log(
      `day-of: ${notified} notificaciones en ${events.length} eventos del día`,
    );
    return { events: events.length, notified };
  }
}
