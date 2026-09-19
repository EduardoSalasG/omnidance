"use client";

import { useTranslations } from "next-intl";
import { ModuleCard, ModuleGrid } from "@/components/console/module-grid";
import { ProducerGate } from "@/components/producer/producer-gate";

/**
 * /productor — hub de la consola del productor. Cada módulo vive en su
 * subruta (/productor/eventos, /productor/codigos, /productor/listas,
 * /productor/pagos, /crm) y fetchea sus propios datos tras el gate.
 */
export default function ProducerPage() {
  const t = useTranslations("producer");

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 p-6">
      <p className="text-white/60">{t("hubDesc")}</p>

      <ProducerGate>
        <ModuleGrid>
          <ModuleCard
            href="/productor/eventos"
            title={t("myEvents")}
            desc={t("navEventsDesc")}
          />
          <ModuleCard
            href="/productor/codigos"
            title={t("modules.codes")}
            desc={t("modules.codesDesc")}
          />
          <ModuleCard
            href="/productor/listas"
            title={t("modules.lists")}
            desc={t("modules.listsDesc")}
          />
          <ModuleCard
            href="/productor/pagos"
            title={t("payouts")}
            desc={t("navPayoutsDesc")}
          />
          <ModuleCard
            href="/productor/parametros"
            title={t("modules.params")}
            desc={t("modules.paramsDesc")}
          />
          <ModuleCard
            href="/crm"
            title={t("crm")}
            desc={t("navCrmDesc")}
          />
        </ModuleGrid>
      </ProducerGate>
    </main>
  );
}
