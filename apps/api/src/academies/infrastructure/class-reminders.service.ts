import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../prisma.service";
import { NotificationsService } from "../../notifications/domain/notifications.service";
import { classStart } from "../domain/academy.service";

const MIN = 60_000;
// Offsets pre-clase en minutos - el sweep corre cada minuto (cron
// `* * * * *` en AcademiesScheduler) y dispara ambos según corresponda.
const REMINDER_OFFSETS = [30, 10] as const;
// Ventana de búsqueda del dedupe: una notificación class.reminder más
// vieja que esto no es de esta corrida (offsets máximos + holgura).
const DEDUP_LOOKBACK_MS = 2 * 60 * MIN;

/**
 * Recordatorios de clase (spec academies/class-series): a los 30 y 10
 * minutos del inicio real (`classStart`) notifica al plantel completo
 * (primario + co-instructores de clase/slot + default de serie) y a los
 * alumnos con reserva BOOKED. WAITLIST, canceladas y clases ya iniciadas
 * no generan aviso.
 *
 * Dedupe por (personId, classId, minutes) vía Notification existente -
 * el job corre cada minuto y la misma ventana se solapa entre corridas.
 * Best-effort por destinatario: un fallo no aborta el barrido.
 */
@Injectable()
export class ClassRemindersService {
  private readonly logger = new Logger(ClassRemindersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async runSweep(now = new Date()): Promise<{ classes: number; sent: number }> {
    // Interesan solo las clases cuyo inicio real cae en (now, now+30min].
    // Class.date es medianoche UTC del día → el barrido por fecha cubre
    // hoy/mañana/pasado (una clase 23:59+30min cruza al día siguiente).
    const dayStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const classes = await this.prisma.class.findMany({
      where: {
        cancelled: false,
        date: {
          gte: new Date(dayStart.getTime() - 24 * 60 * MIN),
          lte: new Date(dayStart.getTime() + 48 * 60 * MIN),
        },
      },
      select: {
        id: true,
        date: true,
        instructorId: true,
        instructors: { select: { personId: true } },
        bookings: {
          where: { status: "BOOKED" },
          select: { personId: true },
        },
        slot: {
          select: {
            startTime: true,
            instructorId: true,
            instructors: { select: { personId: true } },
            academy: { select: { name: true } },
            series: {
              select: {
                name: true,
                instructorId: true,
                level: { select: { name: true } },
              },
            },
          },
        },
      },
    });

    // (now, now + 30min] - clase ya iniciada no avisa.
    const horizon = new Date(now.getTime() + 30 * MIN);
    const due = classes.filter((c) => {
      const start = classStart(c.date, c.slot.startTime);
      return start > now && start <= horizon;
    });
    if (!due.length) return { classes: 0, sent: 0 };

    // Candidatos (persona, clase, offset): a 8 min del inicio corren
    // tanto el de 30 (si no salió) como el de 10.
    type Candidate = {
      personId: string;
      classId: string;
      minutes: number;
      url: string;
      title: string;
      body: string;
    };
    const candidates: Candidate[] = [];
    for (const c of due) {
      const start = classStart(c.date, c.slot.startTime);
      const minutesLeft = (start.getTime() - now.getTime()) / MIN;
      const instructorIds = new Set(
        [
          c.instructorId,
          c.slot.instructorId,
          c.slot.series.instructorId,
          ...(c.instructors ?? []).map((i) => i.personId),
          ...(c.slot.instructors ?? []).map((i) => i.personId),
        ].filter((x): x is string => !!x),
      );
      const seriesName = c.slot.series.name;
      const levelName = c.slot.series.level?.name;
      const academyName = c.slot.academy.name;
      const body = `${seriesName}${levelName ? ` ${levelName}` : ""} en ${academyName}`;
      const recipients: { personId: string; url: string }[] = [
        ...[...instructorIds].map((personId) => ({
          personId,
          url: `/academia/clases/${c.id}`,
        })),
        ...c.bookings.map((b) => ({
          personId: b.personId,
          url: `/clases/${c.id}`,
        })),
      ];
      for (const minutes of REMINDER_OFFSETS) {
        if (minutesLeft > minutes) continue;
        for (const r of recipients) {
          candidates.push({
            personId: r.personId,
            classId: c.id,
            minutes,
            url: r.url,
            title: `Faltan ${minutes} minutos para tu clase`,
            body,
          });
        }
      }
    }
    if (!candidates.length) return { classes: due.length, sent: 0 };

    // Dedupe: notificaciones class.reminder recientes de estos
    // destinatarios → skip (personId + data.classId + data.minutes).
    const personIds = [...new Set(candidates.map((c) => c.personId))];
    const existing = await this.prisma.notification.findMany({
      where: {
        type: "class.reminder",
        personId: { in: personIds },
        createdAt: { gte: new Date(now.getTime() - DEDUP_LOOKBACK_MS) },
      },
      select: { personId: true, data: true },
    });
    const sent = new Set(
      existing
        .map((n) => ({
          personId: n.personId,
          ...((n.data ?? {}) as { classId?: string; minutes?: number }),
        }))
        .filter((x) => x.classId != null && x.minutes != null)
        .map((x) => `${x.personId}:${x.classId}:${x.minutes}`),
    );

    let count = 0;
    for (const cand of candidates) {
      if (sent.has(`${cand.personId}:${cand.classId}:${cand.minutes}`)) {
        continue;
      }
      try {
        await this.notifications.notifySafe(cand.personId, {
          category: "SOCIAL",
          type: "class.reminder",
          title: cand.title,
          body: cand.body,
          data: {
            classId: cand.classId,
            minutes: cand.minutes,
            url: cand.url,
          },
        });
        count++;
      } catch (err) {
        this.logger.error(
          `class.reminder falló (clase ${cand.classId}, persona ${cand.personId}): ${
            err instanceof Error ? err.message : err
          }`,
        );
      }
    }
    if (count) {
      this.logger.log(
        `class.reminder: ${count} notificaciones en ${due.length} clases`,
      );
    }
    return { classes: due.length, sent: count };
  }
}
