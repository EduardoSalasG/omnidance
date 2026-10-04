import { Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import { schedule } from "node-cron";
import { SubscriptionsService } from "../application/subscriptions.service";
import { PlatformSubscriptionsService } from "../application/platform-subscriptions.service";

/**
 * Reconcile diario (09:00) de las suscripciones Flow vivas — provider
 * fino: la lógica vive en SubscriptionsService.reconcileAll() (membresías
 * de alumnos) y PlatformSubscriptionsService.reconcileAll() (SaaS de
 * academias + Producer Pro — spec academy-saas-billing): settle de
 * invoices pagados, sync de estado/nextInvoiceAt, reminder del cobro del
 * día siguiente, mora (grace de academia) y aplicación de cambios de plan
 * pendientes. Es la red de seguridad del webhook (subscription/callback
 * dispara el mismo barrido fire-and-forget) y del refresh de las vistas.
 */
@Injectable()
export class SubscriptionsScheduler implements OnModuleInit {
  private readonly logger = new Logger(SubscriptionsScheduler.name);

  constructor(
    private readonly subs: SubscriptionsService,
    private readonly platformSubs: PlatformSubscriptionsService,
  ) {}

  onModuleInit(): void {
    // En tests no se registra el cron (el spec ejerce reconcileAll
    // directo, sin scheduler).
    if (process.env.NODE_ENV === "test") return;
    schedule("0 9 * * *", () => {
      this.subs.reconcileAll("cron").catch((e: unknown) => {
        this.logger.error(
          "reconcileAll de suscripciones falló",
          e instanceof Error ? e.stack : String(e),
        );
      });
      this.platformSubs.reconcileAll("cron").catch((e: unknown) => {
        this.logger.error(
          "reconcileAll de suscripciones de plataforma falló",
          e instanceof Error ? e.stack : String(e),
        );
      });
    });
    this.logger.log("cron de reconcile de suscripciones registrado (0 9 * * *)");
  }
}
