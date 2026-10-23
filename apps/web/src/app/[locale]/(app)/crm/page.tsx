"use client";

import { useTranslations } from "next-intl";
import {
  CrmGateScreen,
  useCrmContext,
} from "@/components/crm/crm-context";
import { PeopleTable } from "@/components/crm/people-table";
import { ProPaywall } from "@/components/producer/pro-paywall";
import { AcademyTierPaywall } from "@/components/academy/academy-tier-gate";
import {
  OnboardingRunner,
  type TourStep,
} from "@/components/onboarding/OnboardingRunner";

// Hub del CRM: personas del actor + acceso a campañas y triggers.
export default function CrmPage() {
  const t = useTranslations("crm");
  const tt = useTranslations("tours.crm");
  const ctx = useCrmContext();

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6 pb-6 lg:max-w-5xl lg:px-8">
      <CrmGateScreen gate={ctx.gate} onRetry={() => void ctx.boot()} />

      {ctx.gate === "ready" && (
        <>
          {ctx.actor ? (
            ctx.tierBlocked ? (
            <AcademyTierPaywall feature="crm" />
          ) : ctx.proBlocked ? (
              // El CRM del productor es feature Producer Pro - el API
              // responde 403 pro.required en todos sus endpoints.
              <ProPaywall />
            ) : (
              <>
                <PeopleTable actor={ctx.actor} />

                {/* Tour de primera visita - solo con actor listo y sin
                    paywall: los targets crm-* existen recién con la
                    tabla montada; el runner filtra los que falten. */}
                <OnboardingRunner
                  tour="crm"
                  steps={
                    [
                      {
                        element: "[data-tour='crm-people']",
                        title: tt("s1.title"),
                        description: tt("s1.desc"),
                        side: "top",
                      },
                      {
                        element: "[data-tour='crm-segments']",
                        title: tt("s2.title"),
                        description: tt("s2.desc"),
                        side: "bottom",
                      },
                      {
                        element: "[data-tour='crm-filters']",
                        title: tt("s3.title"),
                        description: tt("s3.desc"),
                        side: "bottom",
                      },
                      {
                        element: "[data-tour='crm-bulk']",
                        title: tt("s4.title"),
                        description: tt("s4.desc"),
                        side: "bottom",
                      },
                      {
                        element: "[data-tour='crm-actor']",
                        title: tt("s5.title"),
                        description: tt("s5.desc"),
                        side: "bottom",
                      },
                      {
                        // En ≥lg la hamburguesa no existe - el anchor
                        // cae a la sidebar (mismo texto, dos anchors).
                        element: "[data-tour='appbar-menu']",
                        title: tt("s6.title"),
                        description: tt("s6.desc"),
                        side: "bottom",
                      },
                      {
                        element: "[data-tour='app-sidebar']",
                        title: tt("s6.title"),
                        description: tt("s6.desc"),
                        side: "right",
                      },
                      {
                        element: "[data-tour='appbar-bell']",
                        title: tt("s7.title"),
                        description: tt("s7.desc"),
                        side: "bottom",
                      },
                    ] satisfies TourStep[]
                  }
                />
              </>
            )
          ) : (
            <p className="text-ink/60">{t("pickActor")}</p>
          )}
        </>
      )}
    </main>
  );
}
