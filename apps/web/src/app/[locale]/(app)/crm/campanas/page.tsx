"use client";

import { useTranslations } from "next-intl";
import { Button, PlusIcon } from "@/components/ui";
import {
  CrmGateScreen,
  useCrmContext,
} from "@/components/crm/crm-context";
import { CampaignList } from "@/components/crm/campaign-list";
import { ProPaywall } from "@/components/producer/pro-paywall";
import { AcademyTierPaywall } from "@/components/academy/academy-tier-gate";

// Listado de campañas del actor. El h1 de página lo provee el chrome
// (appbar); crear = CTA → /crm/campanas/nueva (patrón de consola).
export default function CrmCampanasPage() {
  const t = useTranslations("crm");
  const ctx = useCrmContext();

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6 pb-6 lg:max-w-5xl lg:px-8">
      <CrmGateScreen gate={ctx.gate} onRetry={() => void ctx.boot()} />

      {ctx.gate === "ready" && (
        <>
          {!ctx.actor ? (
            <p className="text-ink/60">{t("pickActor")}</p>
          ) : ctx.tierBlocked ? (
            <AcademyTierPaywall feature="crm" />
          ) : ctx.proBlocked ? (
            // El CRM del productor es feature Producer Pro - el API
            // responde 403 pro.required en todos sus endpoints.
            <ProPaywall />
          ) : (
            <>
              <div className="flex justify-end">
                <Button size="sm" variant="secondary" href="/crm/campanas/nueva">
                  <PlusIcon className="h-4 w-4" /> {t("campaigns.new")}
                </Button>
              </div>

              <CampaignList actor={ctx.actor} reloadSignal={0} />
            </>
          )}
        </>
      )}
    </main>
  );
}
