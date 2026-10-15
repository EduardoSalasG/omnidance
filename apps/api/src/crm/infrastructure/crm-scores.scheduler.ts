import { Inject, Injectable, type OnModuleInit } from "@nestjs/common";
import { JOB_REGISTRY, type JobRegistry } from "../../jobs/registry";
import { CrmService } from "../domain/crm.service";

/**
 * Job diario de recompute de RelationshipScore (spec
 * academy-score-refine): horario en ScheduledJob (DB, /admin/jobs) -
 * default 06:00 America/Santiago. Provider fino: la lógica vive en
 * CrmService.recomputeAllScores() y su resultado alimenta JobRun.meta.
 */
@Injectable()
export class CrmScoresScheduler implements OnModuleInit {
  constructor(
    private readonly crm: CrmService,
    @Inject(JOB_REGISTRY) private readonly registry: JobRegistry,
  ) {}

  onModuleInit(): void {
    this.registry.register({
      key: "crm.scores",
      label: "Recompute de scores de relación",
      description:
        "Recalcula RelationshipScore (score/segment/breakdown) de todos los actores con universo (ACADEMY, PRODUCER).",
      defaultCron: "0 6 * * *",
      handler: async () => this.crm.recomputeAllScores(),
    });
  }
}
