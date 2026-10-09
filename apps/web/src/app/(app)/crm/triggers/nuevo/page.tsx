"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Button, RefreshIcon } from "@/components/ui";
import { SkeletonCard } from "@/components/ui";
import { ConsoleHeader } from "@/components/console/console-header";
import {
  ActorPicker,
  CrmGateScreen,
  CrmNav,
  useCrmContext,
} from "@/components/crm/crm-context";
import { TriggerForm } from "@/components/crm/trigger-form";
import { ProPaywall } from "@/components/producer/pro-paywall";
import type { CrmActor, CrmTrigger } from "@/components/crm/types";
import { actorQuery } from "@/components/crm/types";

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
      <CrmNav active="triggers" />

      <CrmGateScreen gate={ctx.gate} onRetry={() => void ctx.boot()} />

      {ctx.gate === "ready" && (
        <>
          <ActorPicker ctx={ctx} />
          {!ctx.actor ? (
            <p className="text-ink/60">{t("pickActor")}</p>
          ) : ctx.proBlocked ? (
            <ProPaywall />
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

  return (
    <TriggerForm
      actor={actor}
      existingKeys={keys}
      editing={null}
      onCancel={() => router.push("/crm/triggers")}
      onSaved={() => router.push("/crm/triggers")}
    />
  );
}
