"use client";

import { useState } from "react";

import { useTranslations } from "next-intl";
import { ConsoleHeader } from "@/components/console/console-header";
import {
  CrmGateScreen,
  useCrmContext,
} from "@/components/crm/crm-context";
import { SegmentForm } from "@/components/crm/segment-form";
import { ProPaywall } from "@/components/producer/pro-paywall";
import { AcademyTierPaywall } from "@/components/academy/academy-tier-gate";
import { useRouter } from "@/i18n/navigation";

// Crear segmento → POST /crm/segments (patrón de consola: página
// dedicada con ConsoleHeader, vuelve al listado tras aviso de éxito).
export default function NuevoSegmentoPage() {
  const t = useTranslations("crm");
  const router = useRouter();
  const ctx = useCrmContext();
  const [saved, setSaved] = useState(false);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6 pb-6 lg:max-w-3xl lg:px-8">
      <ConsoleHeader
        backHref="/crm/segmentos"
        backLabel={t("actorSegments.title")}
      />

      <CrmGateScreen gate={ctx.gate} onRetry={() => void ctx.boot()} />

      {ctx.gate === "ready" && (
        <>
          {!ctx.actor ? (
            <p className="text-ink/60">{t("pickActor")}</p>
          ) : ctx.tierBlocked ? (
            <AcademyTierPaywall feature="crm" />
          ) : ctx.proBlocked ? (
            <ProPaywall />
          ) : saved ? (
            <p role="status" className="text-sm text-neon">
              {t("actorSegments.saved")}
            </p>
          ) : (
            <SegmentForm
              actor={ctx.actor}
              editing={null}
              onSaved={() => {
                setSaved(true);
                setTimeout(() => router.push("/crm/segmentos"), 900);
              }}
              onCancel={() => router.push("/crm/segmentos")}
            />
          )}
        </>
      )}
    </main>
  );
}
