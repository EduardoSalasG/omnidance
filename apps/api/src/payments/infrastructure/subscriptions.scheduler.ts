import { Inject, Injectable, type OnModuleInit } from "@nestjs/common";
import { JOB_REGISTRY, type JobRegistry } from "../../jobs/registry";
import { SubscriptionsService } from "../application/subscriptions.service";
import { PlatformSubscriptionsService } from "../application/platform-subscriptions.service";

/**
 * Job diario de suscripciones (spec admin-jobs-mail-campaigns): el
 * horario vive en ScheduledJob (DB) administrable desde /admin/jobs -
 * el código solo registra handler + default (09:00 America/Santiago).
 * El handler agrupa los tres barridos: reconcileAll de membresías y de
 * suscripciones de plataforma (SaaS academias + Producer Pro - spec
 * academy-saas-billing: settle de invoices pagados, sync de
 * estado/nextInvoiceAt, reminder del cobro del día siguiente, mora y
 * cambios de plan pendientes) + enforceAcademyBlocks (S3). Los
 * contadores de cada barrido van a JobRun.meta. Es la red de seguridad
 * del webhook (subscription/callback dispara el mismo barrido) y del
 * refresh de las vistas.
 */
@Injectable()
export class SubscriptionsScheduler implements OnModuleInit {
  constructor(
    private readonly subs: SubscriptionsService,
    private readonly platformSubs: PlatformSubscriptionsService,
    @Inject(JOB_REGISTRY) private readonly registry: JobRegistry,
  ) {}

  onModuleInit(): void {
    this.registry.register({
      key: "subscriptions.reconcile",
      label: "Reconcile de suscripciones",
      description:
        "Sync diario de membresías de alumnos y suscripciones SaaS (academias + Producer Pro) con la pasarela, más enforcement de bloqueos por mora.",
      defaultCron: "0 9 * * *",
      handler: async () => {
        const memberships = await this.subs.reconcileAll("cron");
        const platform = await this.platformSubs.reconcileAll("cron");
        const blocks = await this.platformSubs.enforceAcademyBlocks();
        return { memberships, platform, blocks };
      },
    });
  }
}
