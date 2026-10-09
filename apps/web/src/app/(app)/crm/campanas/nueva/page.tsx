"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ConsoleHeader } from "@/components/console/console-header";
import {
  ActorPicker,
  CrmGateScreen,
  CrmNav,
  useCrmContext,
} from "@/components/crm/crm-context";
import { CampaignForm } from "@/components/crm/campaign-form";
import { ProPaywall } from "@/components/producer/pro-paywall";
import { actorKey } from "@/components/crm/types";

// Crear campaña = página dedicada (patrón de consola): el form queda
// DRAFT y al crear vuelve al listado.
export default function CrmCampanaNuevaPage() {
  const t = useTranslations("crm");
  const router = useRouter();
  const ctx = useCrmContext();

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6 pb-6 lg:max-w-5xl lg:px-8">
      <ConsoleHeader backHref="/crm/campanas" backLabel={t("campaigns.title")} />
      <CrmNav active="campaigns" />

      <CrmGateScreen gate={ctx.gate} onRetry={() => void ctx.boot()} />

      {ctx.gate === "ready" && (
        <>
          <ActorPicker ctx={ctx} />
          {!ctx.actor ? (
            <p className="text-ink/60">{t("pickActor")}</p>
          ) : ctx.proBlocked ? (
            <ProPaywall />
          ) : (
            <CampaignForm
              key={actorKey(ctx.actor)}
              actor={ctx.actor}
              onCancel={() => router.push("/crm/campanas")}
              onCreated={() => router.push("/crm/campanas")}
            />
          )}
        </>
      )}
    </main>
  );
}
