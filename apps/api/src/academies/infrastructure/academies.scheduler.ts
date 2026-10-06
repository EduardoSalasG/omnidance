import { Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import { schedule } from "node-cron";
import { AcademyRemindersService } from "./academy-reminders.service";

/**
 * Cron diario 09:00 del dominio academias - hoy solo corre el barrido
 * de recordatorios de renovación (spec academy-renewal-reminders).
 * Mismo patrón que SubscriptionsScheduler: provider fino, la lógica
 * vive en el servicio y en tests se ejerce directo (sin scheduler).
 */
@Injectable()
export class AcademiesScheduler implements OnModuleInit {
  private readonly logger = new Logger(AcademiesScheduler.name);

  constructor(private readonly reminders: AcademyRemindersService) {}

  onModuleInit(): void {
    if (process.env.NODE_ENV === "test") return;
    schedule("0 9 * * *", () => {
      this.reminders.runDaily().catch((e: unknown) => {
        this.logger.error(
          "recordatorios de renovación fallaron",
          e instanceof Error ? e.stack : String(e),
        );
      });
    });
    this.logger.log("cron de recordatorios de academia registrado (0 9 * * *)");
  }
}
