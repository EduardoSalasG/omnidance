import { Inject, Injectable, type OnModuleInit } from "@nestjs/common";
import { JOB_REGISTRY, type JobRegistry } from "../../jobs/registry";
import { AcademyRemindersService } from "./academy-reminders.service";

/**
 * Registro del job diario de academias (spec admin-jobs-mail-campaigns):
 * el horario ya no vive en código - ScheduledJob en DB es la fuente de
 * verdad y el admin lo controla desde /admin/jobs. El código solo
 * aporta el handler y el default (09:00 America/Santiago).
 * Provider fino: la lógica vive en AcademyRemindersService y en tests
 * se ejerce directo.
 */
@Injectable()
export class AcademiesScheduler implements OnModuleInit {
  constructor(
    private readonly reminders: AcademyRemindersService,
    @Inject(JOB_REGISTRY) private readonly registry: JobRegistry,
  ) {}

  onModuleInit(): void {
    this.registry.register({
      key: "academies.renewal_reminders",
      label: "Recordatorios de renovación de academias",
      description:
        "Barrido diario de enrollments por vencer: mails + notificaciones de renovación a alumnos.",
      defaultCron: "0 9 * * *",
      handler: async () => this.reminders.runDaily() as Promise<Record<string, unknown> | void>,
    });
  }
}
