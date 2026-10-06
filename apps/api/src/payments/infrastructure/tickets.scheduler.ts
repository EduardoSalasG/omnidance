import { Inject, Injectable, type OnModuleInit } from "@nestjs/common";
import { JOB_REGISTRY, type JobRegistry } from "../../jobs/registry";
import { TicketDayOfService } from "../application/ticket-day-of.service";

/**
 * Job day-of de tickets (spec wallet-passes + admin-jobs-mail-campaigns):
 * horario en ScheduledJob (DB, /admin/jobs) - default 09:00
 * America/Santiago explícito (antes corría a las 13:00 hora servidor,
 * frágil a la zona del host). La lógica vive en TicketDayOfService; el
 * handler solo dispara y reporta {events, notified} a JobRun.meta.
 */
@Injectable()
export class TicketsScheduler implements OnModuleInit {
  constructor(
    private readonly dayOf: TicketDayOfService,
    @Inject(JOB_REGISTRY) private readonly registry: JobRegistry,
  ) {}

  onModuleInit(): void {
    this.registry.register({
      key: "tickets.day_of",
      label: "Notificaciones day-of de tickets",
      description:
        "La mañana del evento avisa por push a cada dueño de ticket activo que su entrada es válida hoy.",
      defaultCron: "0 9 * * *",
      handler: async () => this.dayOf.runDaily(),
    });
  }
}
