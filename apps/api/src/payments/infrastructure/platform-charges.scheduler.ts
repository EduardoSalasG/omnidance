import { Inject, Injectable, type OnModuleInit } from "@nestjs/common";
import { JOB_REGISTRY, type JobRegistry } from "../../jobs/registry";
import { PlatformChargesService } from "../application/platform-charges.service";

/**
 * Reintento diario de cobros sueltos impagos (spec
 * payments/platform-charges): los PLATFORM_CHARGE que degradaron a
 * PENDING (actor sin medio de pago al cobro inicial) se reintentan por
 * `provider.collect()` sobre el mismo Payment hasta el tope del param
 * `platform_charges.retry.max_attempts`. Corre 30min después de
 * `subscriptions.reconcile` (una suscripción recuperada en el barrido
 * de las 09:00 suele venir con tarjeta recién registrada). Horario
 * administrable desde /admin/jobs; contadores a JobRun.meta.
 */
@Injectable()
export class PlatformChargesScheduler implements OnModuleInit {
  constructor(
    private readonly charges: PlatformChargesService,
    @Inject(JOB_REGISTRY) private readonly registry: JobRegistry,
  ) {}

  onModuleInit(): void {
    this.registry.register({
      key: "platform-charges.collect",
      label: "Reintento de cobros sueltos",
      description:
        "Reintenta collect() sobre los PLATFORM_CHARGE PENDING (actor sin medio de pago al cobro inicial) hasta el tope de reintentos.",
      defaultCron: "30 9 * * *",
      handler: async () => this.charges.retryPending("cron"),
    });
  }
}
