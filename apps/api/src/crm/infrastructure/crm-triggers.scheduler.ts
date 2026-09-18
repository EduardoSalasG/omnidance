import { Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import { schedule } from "node-cron";
import { CrmService } from "../domain/crm.service";

/**
 * Evaluación diaria (09:00) de todos los CrmTrigger activos de la
 * plataforma — provider fino: la lógica vive en
 * CrmService.evaluateAllActiveTriggers().
 */
@Injectable()
export class CrmTriggersScheduler implements OnModuleInit {
  private readonly logger = new Logger(CrmTriggersScheduler.name);

  constructor(private readonly crm: CrmService) {}

  onModuleInit(): void {
    // En tests no se registra el cron (los e2e evalúan por endpoint).
    if (process.env.NODE_ENV === "test") return;
    schedule("0 9 * * *", () => {
      this.crm.evaluateAllActiveTriggers().catch((e: unknown) => {
        this.logger.error(
          "evaluateAllActiveTriggers falló",
          e instanceof Error ? e.stack : String(e),
        );
      });
    });
    this.logger.log("cron de triggers CRM registrado (0 9 * * *)");
  }
}
