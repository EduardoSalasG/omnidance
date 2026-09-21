"use client";

import { useTranslations } from "next-intl";
import { ModuleCard, ModuleGrid } from "@/components/console/module-grid";
import { ProducerGate } from "@/components/producer/producer-gate";
import {
  OnboardingRunner,
  type TourStep,
} from "@/components/onboarding/OnboardingRunner";

/**
 * /productor — hub de la consola del productor. Cada módulo vive en su
 * subruta (/productor/eventos, /productor/codigos, /productor/listas,
 * /productor/pagos, /crm) y fetchea sus propios datos tras el gate.
 */
export default function ProducerPage() {
  const t = useTranslations("producer");
  const tt = useTranslations("tours.productor");

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

        {/* Tour de primera visita — los targets viven en el chrome
            (nav + menú), siempre presentes una vez pasa el gate. */}
        <OnboardingRunner
          tour="productor"
          steps={
            [
              {
                element: "[data-tour='nav-create']",
                title: tt("s1.title"),
                description: tt("s1.desc"),
                side: "top",
              },
              {
                element: "[data-tour='nav-events']",
                title: tt("s2.title"),
                description: tt("s2.desc"),
                side: "top",
              },
              {
                element: "[data-tour='nav-payouts']",
                title: tt("s3.title"),
                description: tt("s3.desc"),
                side: "top",
              },
              {
                element: "[data-tour='appbar-menu']",
                title: tt("s4.title"),
                description: tt("s4.desc"),
                side: "bottom",
              },
            ] satisfies TourStep[]
          }
        />
      </ProducerGate>
    </main>
  );
}
