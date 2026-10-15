"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  ActorPicker,
  CrmGateScreen,
  useCrmContext,
} from "@/components/crm/crm-context";
import { SegmentForm } from "@/components/crm/segment-form";
import { ProPaywall } from "@/components/producer/pro-paywall";

// Crear segmento → POST /crm/segments (patrón de consola: página
// dedicada, vuelve al listado tras aviso breve de éxito).
export default function NuevoSegmentoPage() {
  const t = useTranslations("crm");
  const router = useRouter();
  const ctx = useCrmContext();
  const [saved, setSaved] = useState(false);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6 pb-6 lg:max-w-3xl lg:px-8">
      <CrmGateScreen gate={ctx.gate} onRetry={() => void ctx.boot()} />

      {ctx.gate === "ready" && (
        <>
          <ActorPicker ctx={ctx} />
          {!ctx.actor ? (
            <p className="text-ink/60">{t("pickActor")}</p>
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
