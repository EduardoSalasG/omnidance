import { Inject, Injectable, type OnModuleInit } from "@nestjs/common";
import { JOB_REGISTRY, type JobRegistry } from "../../jobs/registry";
import { CrmService } from "../domain/crm.service";

/**
 * Job diario de triggers CRM (spec admin-jobs-mail-campaigns): horario
 * en ScheduledJob (DB, /admin/jobs) - default 09:00 America/Santiago.
 * Provider fino: la lógica vive en CrmService.evaluateAllActiveTriggers()
 * y su resultado alimenta JobRun.meta.
 */
@Injectable()
export class CrmTriggersScheduler implements OnModuleInit {
  constructor(
    private readonly crm: CrmService,
    @Inject(JOB_REGISTRY) private readonly registry: JobRegistry,
  ) {}

  onModuleInit(): void {
    this.registry.register({
      key: "crm.triggers",
      label: "Evaluación de triggers CRM",
      description:
        "Evalúa todos los CrmTrigger activos de la plataforma y dispara sus campañas (notificaciones MARKETING).",
      defaultCron: "0 9 * * *",
      handler: async () => this.crm.evaluateAllActiveTriggers() as Promise<Record<string, unknown> | void>,
    });
  }
}
