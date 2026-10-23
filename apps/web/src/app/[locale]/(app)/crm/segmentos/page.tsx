"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button, PlusIcon } from "@/components/ui";
import {
  CrmGateScreen,
  useCrmContext,
} from "@/components/crm/crm-context";
import { SegmentList } from "@/components/crm/segment-list";
import { TierPaywall } from "@/components/tier-paywall";

// Segmentos dinámicos del actor (spec crm-dynamic-segments). Crear =
// CTA → /crm/segmentos/nuevo; cada card → ficha /crm/segmentos/[id].
export default function CrmSegmentosPage() {
  const t = useTranslations("crm");
  const ctx = useCrmContext();
  const [reload, setReload] = useState(0);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6 pb-6 lg:max-w-5xl lg:px-8">
      <CrmGateScreen gate={ctx.gate} onRetry={() => void ctx.boot()} />

      {ctx.gate === "ready" && (
        <>
          {!ctx.actor ? (
            <p className="text-ink/60">{t("pickActor")}</p>
          ) : ctx.blocked ? (
            // El actor no cubre "crm" - el API responde 403
            // tier.required en todos sus endpoints.
            <TierPaywall feature="crm" actorType={ctx.actor.actorType} />
          ) : (
            <>
              <div className="flex justify-end">
                <Button
                  size="sm"
                  variant="secondary"
                  href="/crm/segmentos/nuevo"
                >
                  <PlusIcon className="h-4 w-4" /> {t("actorSegments.new")}
                </Button>
              </div>

              <SegmentList actor={ctx.actor} reloadSignal={reload} />
            </>
          )}
        </>
      )}
    </main>
  );
}
