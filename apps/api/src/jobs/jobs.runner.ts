import { Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import { schedule } from "node-cron";
import { JobsService } from "./jobs.service";

/**
 * Runner central (spec admin-jobs-mail-campaigns): UN solo node-cron
 * por minuto que delega en JobsService.tick() - la DB decide qué corre
 * (enabled + nextRunAt vencido). Catch-up: un job vencido mientras el
 * proceso estaba caído corre una vez al arrancar.
 */
@Injectable()
export class JobsRunner implements OnModuleInit {
  private readonly logger = new Logger(JobsRunner.name);

  constructor(private readonly jobs: JobsService) {}

  onModuleInit(): void {
    if (process.env.NODE_ENV === "test") return;
    schedule("* * * * *", () => {
      this.jobs.tick().catch((e: unknown) => {
        this.logger.error(
          "tick de jobs falló",
          e instanceof Error ? e.stack : String(e),
        );
      });
    });
    this.logger.log("runner de jobs registrado (tick cada minuto)");
  }
}
