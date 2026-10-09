"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
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
import type { CrmTrigger } from "@/components/crm/types";
import { actorQuery } from "@/components/crm/types";

// Editar trigger = página dedicada: resuelve el trigger desde el
// listado del actor (la API no expone GET /crm/triggers/:id y el
// universo por actor es acotado a las 4 keys posibles).
export default function CrmTriggerEditPage() {
  const t = useTranslations("crm");
  const tc = useTranslations("common");
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const ctx = useCrmContext();

  const [items, setItems] = useState<CrmTrigger[] | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    if (!ctx.actor) return;
    setError(false);
    try {
      const res = await apiFetch(`/crm/triggers?${actorQuery(ctx.actor)}`);
      if (!res.ok) return setError(true);
      setItems((await res.json()) as CrmTrigger[]);
    } catch {
      setError(true);
    }
  }, [ctx.actor]);

  useEffect(() => {
    setItems(null);
    void load();
  }, [load]);

  const editing = items?.find((tr) => tr.id === id) ?? null;

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
          ) : items === null && !error ? (
            <SkeletonCard lines={2} />
          ) : error || items === null ? (
            <div className="flex items-center gap-3">
              <p role="alert" className="text-sm text-red-400">
                {tc("error")}
              </p>
              <Button size="sm" variant="ghost" onClick={() => void load()}>
                <RefreshIcon /> {tc("retry")}
              </Button>
            </div>
          ) : editing === null ? (
            <p role="alert" className="text-sm text-red-400">
              {t("triggers.notFound")}
            </p>
          ) : (
            <TriggerForm
              key={editing.id}
              actor={ctx.actor}
              existingKeys={items.map((tr) => tr.key)}
              editing={editing}
              onCancel={() => router.push("/crm/triggers")}
              onSaved={() => router.push("/crm/triggers")}
            />
          )}
        </>
      )}
    </main>
  );
}
