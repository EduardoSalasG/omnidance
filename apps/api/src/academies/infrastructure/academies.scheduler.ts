import { Inject, Injectable, type OnModuleInit } from "@nestjs/common";
import { JOB_REGISTRY, type JobRegistry } from "../../jobs/registry";
import { AcademyMaterializeService } from "./class-series-materialize.service";
import { AcademyRemindersService } from "./academy-reminders.service";
import { AcademySurveysService } from "./academy-surveys.service";

/**
 * Registro de los jobs diarios de academias (spec
 * admin-jobs-mail-campaigns): el horario ya no vive en código -
 * ScheduledJob en DB es la fuente de verdad y el admin lo controla
 * desde /admin/jobs. El código solo aporta el handler y el default.
 * Provider fino: la lógica vive en los services y en tests se ejerce
 * directo.
 */
@Injectable()
export class AcademiesScheduler implements OnModuleInit {
  constructor(
    private readonly reminders: AcademyRemindersService,
    private readonly materialize: AcademyMaterializeService,
    private readonly surveys: AcademySurveysService,
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
    // Series ilimitadas (spec academies/class-series): extiende la
    // ventana rodante de clases (hoy → fin del mes siguiente) para
    // todos los slots de series activas. Temprano para que la
    // materialización esté lista antes de la primera reserva del día.
    this.registry.register({
      key: "academies.class_materialization",
      label: "Materialización de clases de academias",
      description:
        "Ventana rodante de instancias Class (hoy → fin del mes siguiente) para los slots de series activas.",
      defaultCron: "30 3 * * *",
      handler: async () => this.materialize.runDaily(),
    });
    // Encuestas mensuales de curso (spec academy-console-v3): el día 1
    // se notifica a cada alumno las series que cursó el mes anterior y
    // aún no evaluó. Corre tras materialize (las clases ya existen).
    this.registry.register({
      key: "academies.course_surveys",
      label: "Encuestas mensuales de cursos",
      description:
        "Fan-out del día 1: notifica a cada alumno las series que cursó el mes anterior y aún no evaluó.",
      defaultCron: "45 4 1 * *",
      handler: async () => this.surveys.runMonthly(),
    });
  }
}
