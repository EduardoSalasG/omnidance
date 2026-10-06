import { Inject, Injectable, Logger } from "@nestjs/common";
import { EnrollmentStatus } from "@prisma/client";
import { PrismaService } from "../../prisma.service";
import { NotificationsService } from "../../notifications/domain/notifications.service";
import { ParamsService } from "../../params/params.service";
import { MAILER, type Mailer } from "../../auth/domain/ports";
import {
  renewalExpiringEmailHtml,
  renewalGraceEmailHtml,
} from "./renewal-emails";

const DAY_MS = 24 * 60 * 60 * 1000;
const BOOKABLE_PAID: EnrollmentStatus[] = [
  EnrollmentStatus.ACTIVE,
  EnrollmentStatus.ONLINE,
];

const DAY_MS_ADD = (d: Date, days: number) =>
  new Date(d.getTime() + days * DAY_MS);

const dateFmt = new Intl.DateTimeFormat("es-CL", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "America/Santiago",
});

/**
 * Recordatorios de renovación (spec academy-renewal-reminders) - cron
 * diario 09:00 vía AcademiesScheduler:
 *
 * - "Por vencer": endsAt dentro de academy.renewal.first_notice_days.
 * - "En gracia": endsAt vencido pero dentro de academy.renewal.grace_days
 *   (mismo número que resolveQuota usa para bloquear reservas - el mail
 *   promete la fecha que el sistema efectivamente enforza).
 *
 * Dedup por ciclo: reminderExpiringFor/reminderExpiredFor guardan el
 * endsAt avisado; una renovación cambia endsAt y los avisos se rearman.
 * Solo planes pagados (ACTIVE/ONLINE): TRIAL/PAUSED/FROZEN y endsAt
 * null no reciben avisos. Un fallo puntual no detiene el barrido.
 */
@Injectable()
export class AcademyRemindersService {
  private readonly logger = new Logger(AcademyRemindersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly params: ParamsService,
    @Inject(MAILER) private readonly mailer: Mailer,
  ) {}

  async runDaily(now = new Date()): Promise<{
    expiring: number;
    grace: number;
  }> {
    const firstDays = await this.params.getNumber(
      "academy.renewal.first_notice_days",
      5,
    );
    const graceDays = await this.params.getNumber(
      "academy.renewal.grace_days",
      5,
    );
    const webUrl = process.env.WEB_URL ?? "http://localhost:3000";

    // Enrollment no tiene relación a Person (personId string sin FK) -
    // se resuelve nombre/email en una segunda query por lote.
    const expiring = await this.prisma.enrollment.findMany({
      where: {
        status: { in: BOOKABLE_PAID },
        endsAt: { gte: now, lte: DAY_MS_ADD(now, firstDays) },
      },
      select: {
        id: true,
        personId: true,
        academyId: true,
        endsAt: true,
        reminderExpiringFor: true,
        academy: { select: { name: true } },
        plan: { select: { name: true } },
      },
    });
    const inGrace = await this.prisma.enrollment.findMany({
      where: {
        status: { in: BOOKABLE_PAID },
        endsAt: { lt: now, gte: DAY_MS_ADD(now, -graceDays) },
      },
      select: {
        id: true,
        personId: true,
        academyId: true,
        endsAt: true,
        reminderExpiredFor: true,
        academy: { select: { name: true } },
        plan: { select: { name: true } },
      },
    });

    const people = new Map(
      (
        await this.prisma.person.findMany({
          where: {
            id: {
              in: [...expiring, ...inGrace].map((e) => e.personId),
            },
          },
          select: { id: true, email: true, name: true },
        })
      ).map((p) => [p.id, p]),
    );

    let sentExpiring = 0;
    let sentGrace = 0;

    for (const e of expiring) {
      const endsAt = e.endsAt!;
      if (e.reminderExpiringFor?.getTime() === endsAt.getTime()) continue;
      const person = people.get(e.personId);
      if (!person) continue;
      try {
        const endsLabel = dateFmt.format(endsAt);
        const academyUrl = `${webUrl}/academias/${e.academyId}`;
        const input = {
          studentName: person.name,
          academyName: e.academy.name,
          planName: e.plan?.name ?? null,
          endsAtLabel: endsLabel,
          academyUrl,
        };
        // Sin email igual va la notificación in-app + marcador del ciclo.
        if (person.email) {
          await this.mailer.send(
            person.email,
            `Tu plan en ${e.academy.name} vence el ${endsLabel}`,
            renewalExpiringEmailHtml(input),
          );
        }
        await this.notifications.notifySafe(e.personId, {
          category: "TRANSACTIONAL",
          type: "academy.plan_expiring",
          title: "Tu plan está por vencer",
          body: `${e.academy.name} · vence el ${endsLabel}`,
          data: { academyId: e.academyId, enrollmentId: e.id },
        });
        await this.prisma.enrollment.update({
          where: { id: e.id },
          data: { reminderExpiringFor: endsAt },
        });
        sentExpiring++;
      } catch (err) {
        this.logger.error(
          `aviso por vencer falló (enrollment ${e.id}): ${
            err instanceof Error ? err.message : err
          }`,
        );
      }
    }

    for (const e of inGrace) {
      const endsAt = e.endsAt!;
      if (e.reminderExpiredFor?.getTime() === endsAt.getTime()) continue;
      const person = people.get(e.personId);
      if (!person) continue;
      try {
        const graceUntil = DAY_MS_ADD(endsAt, graceDays);
        const endsLabel = dateFmt.format(endsAt);
        const graceLabel = dateFmt.format(graceUntil);
        const academyUrl = `${webUrl}/academias/${e.academyId}`;
        const input = {
          studentName: person.name,
          academyName: e.academy.name,
          planName: e.plan?.name ?? null,
          endsAtLabel: endsLabel,
          graceUntilLabel: graceLabel,
          academyUrl,
        };
        if (person.email) {
          await this.mailer.send(
            person.email,
            `Tu plan en ${e.academy.name} venció - regulariza antes del ${graceLabel}`,
            renewalGraceEmailHtml(input),
          );
        }
        await this.notifications.notifySafe(e.personId, {
          category: "TRANSACTIONAL",
          type: "academy.plan_grace",
          title: "Tu plan venció - estás en días de gracia",
          body: `${e.academy.name} · paga antes del ${graceLabel} para seguir agendando`,
          data: { academyId: e.academyId, enrollmentId: e.id },
        });
        await this.prisma.enrollment.update({
          where: { id: e.id },
          data: { reminderExpiredFor: endsAt },
        });
        sentGrace++;
      } catch (err) {
        this.logger.error(
          `aviso de gracia falló (enrollment ${e.id}): ${
            err instanceof Error ? err.message : err
          }`,
        );
      }
    }

    if (sentExpiring || sentGrace) {
      this.logger.log(
        `recordatorios de renovación: ${sentExpiring} por vencer, ${sentGrace} en gracia`,
      );
    }
    return { expiring: sentExpiring, grace: sentGrace };
  }
}
