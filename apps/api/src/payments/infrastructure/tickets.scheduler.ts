import { Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import { schedule } from "node-cron";
import { TicketDayOfService } from "../application/ticket-day-of.service";

/**
 * Cron day-of de tickets (spec wallet-passes): corre 13:00 UTC (≈09:00
 * Chile) - la notificación llega la mañana del evento. Mismo patrón que
 * AcademiesScheduler: la lógica vive en el servicio y el scheduler solo
 * dispara; en test no se registra.
 */
@Injectable()
export class TicketsScheduler implements OnModuleInit {
  private readonly logger = new Logger(TicketsScheduler.name);

  constructor(private readonly dayOf: TicketDayOfService) {}

  onModuleInit(): void {
    if (process.env.NODE_ENV === "test") return;
    schedule("0 13 * * *", () => {
      this.dayOf.runDaily().catch((e: unknown) => {
        this.logger.error(
          "barrido day-of de tickets falló",
          e instanceof Error ? e.stack : String(e),
        );
      });
    });
    this.logger.log("cron day-of de tickets registrado (0 13 * * * UTC)");
  }
}
