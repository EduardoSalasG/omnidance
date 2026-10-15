import { Inject, Injectable, type OnModuleInit } from "@nestjs/common";
import { JOB_REGISTRY, type JobRegistry } from "../../jobs/registry";
import { CrmService } from "../domain/crm.service";

/**
 * Job de envío de campañas programadas (spec crm-campaign-ops): cada 5
 * minutos envía las Campaign SCHEDULED con scheduledAt vencido. Horario
 * en ScheduledJob (/admin/jobs); resultado en JobRun.meta.
 */
@Injectable()
export class CrmCampaignsScheduler implements OnModuleInit {
  constructor(
    private readonly crm: CrmService,
    @Inject(JOB_REGISTRY) private readonly registry: JobRegistry,
  ) {}

  onModuleInit(): void {
    this.registry.register({
      key: "crm.campaigns",
      label: "Envío de campañas programadas del CRM",
      description:
        "Envía las Campaign SCHEDULED con scheduledAt vencido (programación de campañas del actor).",
      defaultCron: "*/5 * * * *",
      handler: async () => this.crm.sendScheduledCampaigns(),
    });
    // Digest semanal al owner de cada actor (spec crm-channels-digest).
    this.registry.register({
      key: "crm.digest",
      label: "Digest semanal del CRM",
      description:
        "Notifica al owner de cada actor con universo el total de personas y los conteos por segmento.",
      defaultCron: "0 9 * * 1",
      handler: async () => this.crm.sendDigests(),
    });
  }
}
