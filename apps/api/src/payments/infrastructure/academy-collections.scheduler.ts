import { Inject, Injectable, type OnModuleInit } from "@nestjs/common";
import { JOB_REGISTRY, type JobRegistry } from "../../jobs/registry";
import { AcademyCollectionsService } from "../application/academy-collections.service";

/**
 * Ciclo de liquidación del take BYO de academias (spec
 * academy-byo-collections): emite los statements del mes calendario CL
 * recién cerrado (órdenes gateway-PAID con take congelado) y corre el
 * reconcile de cobro - marca PAID los saldados, reintenta collect de
 * los sin pago, y setea/libera `Academy.collectionsBlockedAt` pasada la
 * gracia. Diario 05:00 CL-side; horario administrable desde /admin/jobs;
 * contadores a JobRun.meta.
 */
@Injectable()
export class AcademyCollectionsScheduler implements OnModuleInit {
  constructor(
    private readonly collections: AcademyCollectionsService,
    @Inject(JOB_REGISTRY) private readonly registry: JobRegistry,
  ) {}

  onModuleInit(): void {
    this.registry.register({
      key: "academy-collections.statements",
      label: "Liquidación mensual take academias BYO",
      description:
        "Emite statements del mes cerrado (take neto + IVA sobre órdenes BYO PAID), dispara su cobro y reconcilia bloqueos por liquidación impaga.",
      defaultCron: "0 5 * * *",
      handler: async () => {
        const emitted = await this.collections.emitClosedMonth("cron");
        const reconcile = await this.collections.reconcile("cron");
        return { ...emitted, ...reconcile };
      },
    });
  }
}
