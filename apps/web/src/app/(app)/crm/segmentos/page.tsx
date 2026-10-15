"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button, PlusIcon } from "@/components/ui";
import {
  ActorPicker,
  CrmGateScreen,
  CrmNav,
  useCrmContext,
} from "@/components/crm/crm-context";
import { SegmentList } from "@/components/crm/segment-list";
import { ProPaywall } from "@/components/producer/pro-paywall";

// Segmentos dinámicos del actor (spec crm-dynamic-segments). Crear =
// CTA → /crm/segmentos/nuevo; cada card → ficha /crm/segmentos/[id].
export default function CrmSegmentosPage() {
  const t = useTranslations("crm");
  const ctx = useCrmContext();
  const [reload, setReload] = useState(0);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6 pb-6 lg:max-w-5xl lg:px-8">
      <CrmNav active="segments" />

      <CrmGateScreen gate={ctx.gate} onRetry={() => void ctx.boot()} />

      {ctx.gate === "ready" && (
        <>
          <ActorPicker ctx={ctx} />
          {!ctx.actor ? (
            <p className="text-ink/60">{t("pickActor")}</p>
          ) : ctx.proBlocked ? (
            // El CRM del productor es feature Producer Pro - el API
            // responde 403 pro.required en todos sus endpoints.
            <ProPaywall />
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
