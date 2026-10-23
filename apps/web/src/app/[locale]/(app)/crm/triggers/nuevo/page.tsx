"use client";

import { useCallback, useEffect, useState } from "react";

import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Button, RefreshIcon } from "@/components/ui";
import { SkeletonCard } from "@/components/ui";
import { ConsoleHeader } from "@/components/console/console-header";
import {
  CrmGateScreen,
  useCrmContext,
} from "@/components/crm/crm-context";
import { TriggerForm } from "@/components/crm/trigger-form";
import { TierPaywall } from "@/components/tier-paywall";
import type { CrmActor, CrmTrigger } from "@/components/crm/types";
import { actorQuery } from "@/components/crm/types";
import { useRouter } from "@/i18n/navigation";

// Crear trigger = página dedicada (patrón de consola): trae las keys
// existentes para que el form solo ofrezca las que faltan.
export default function CrmTriggerNuevoPage() {
  const t = useTranslations("crm");
  const tc = useTranslations("common");
  const router = useRouter();
  const ctx = useCrmContext();

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6 pb-6 lg:max-w-5xl lg:px-8">
      <ConsoleHeader backHref="/crm/triggers" backLabel={t("triggers.title")} />

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
            <NewTriggerBody actor={ctx.actor} tc={tc} t={t} router={router} />
          )}
        </>
      )}
    </main>
  );
}

function NewTriggerBody({
  actor,
  t,
  tc,
  router,
}: {
  actor: CrmActor;
  t: ReturnType<typeof useTranslations<"crm">>;
  tc: ReturnType<typeof useTranslations<"common">>;
  router: ReturnType<typeof useRouter>;
}) {
  const [keys, setKeys] = useState<string[] | null>(null);
  const [error, setError] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const res = await apiFetch(`/crm/triggers?${actorQuery(actor)}`);
      if (!res.ok) return setError(true);
      setKeys(((await res.json()) as CrmTrigger[]).map((tr) => tr.key));
    } catch {
      setError(true);
    }
  }, [actor]);

  useEffect(() => {
    setKeys(null);
    void load();
  }, [load]);

  if (keys === null && !error) return <SkeletonCard lines={2} />;
  if (error || keys === null) {
    return (
      <div className="flex items-center gap-3">
        <p role="alert" className="text-sm text-red-400">
          {tc("error")}
        </p>
        <Button size="sm" variant="ghost" onClick={() => void load()}>
          <RefreshIcon /> {tc("retry")}
        </Button>
      </div>
    );
  }

  if (saved) {
    return (
      <p role="status" className="text-sm text-neon">
        {t("triggers.saved")}
      </p>
    );
  }

  return (
    <TriggerForm
      actor={actor}
      existingKeys={keys}
      editing={null}
      onCancel={() => router.push("/crm/triggers")}
      onSaved={() => {
        setSaved(true);
        setTimeout(() => router.push("/crm/triggers"), 900);
      }}
    />
  );
}
