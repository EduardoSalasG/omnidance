"use client";

import { useTranslations } from "next-intl";
import {
  ActorPicker,
  CrmGateScreen,
  CrmNav,
  useCrmContext,
} from "@/components/crm/crm-context";
import { PeopleTable } from "@/components/crm/people-table";
import { ProPaywall } from "@/components/producer/pro-paywall";

// Hub del CRM: personas del actor + acceso a campañas y triggers.
export default function CrmPage() {
  const t = useTranslations("crm");
  const ctx = useCrmContext();

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6 pb-6 lg:max-w-5xl lg:px-8">
      <CrmNav active="people" />

      <CrmGateScreen gate={ctx.gate} onRetry={() => void ctx.boot()} />

      {ctx.gate === "ready" && (
        <>
          <ActorPicker ctx={ctx} />
          {ctx.actor ? (
            ctx.proBlocked ? (
              // El CRM del productor es feature Producer Pro - el API
              // responde 403 pro.required en todos sus endpoints.
              <ProPaywall />
            ) : (
              <PeopleTable actor={ctx.actor} />
            )
          ) : (
            <p className="text-ink/60">{t("pickActor")}</p>
          )}
        </>
      )}
    </main>
  );
}
