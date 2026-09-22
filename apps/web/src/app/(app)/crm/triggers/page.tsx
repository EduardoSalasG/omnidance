"use client";

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui";
import {
  ActorPicker,
  CrmGateScreen,
  CrmNav,
  useCrmContext,
} from "@/components/crm/crm-context";
import { TriggerForm } from "@/components/crm/trigger-form";
import { TriggerList } from "@/components/crm/trigger-list";
import type { CrmTrigger } from "@/components/crm/types";
import { CRM_TRIGGER_KEYS, actorKey } from "@/components/crm/types";

export default function CrmTriggersPage() {
  const t = useTranslations("crm");
  const tc = useTranslations("common");
  const ctx = useCrmContext();

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<CrmTrigger | null>(null);
  const [reloadSignal, setReloadSignal] = useState(0);
  const [existingKeys, setExistingKeys] = useState<string[]>([]);

  // Estable para no re-disparar el fetch de TriggerList en cada render.
  const handleLoaded = useCallback((keys: string[]) => {
    setExistingKeys(keys);
  }, []);

  const remaining = CRM_TRIGGER_KEYS.length - existingKeys.length;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 p-6 pb-6">
      <h1 className="text-2xl font-bold">{t("triggers.title")}</h1>
      <CrmNav active="triggers" />

      <CrmGateScreen gate={ctx.gate} onRetry={() => void ctx.boot()} />

      {ctx.gate === "ready" && (
        <>
          <ActorPicker ctx={ctx} />
          {!ctx.actor ? (
            <p className="text-white/60">{t("pickActor")}</p>
          ) : (
            <>
              <div className="flex items-center justify-end gap-3">
                {remaining <= 0 && !showForm && (
                  <p className="text-xs text-white/50">
                    {t("triggers.allCreated")}
                  </p>
                )}
                {remaining > 0 && (
                  <Button
                    size="sm"
                    variant={showForm && editing === null ? "ghost" : "secondary"}
                    onClick={() => {
                      setEditing(null);
                      setShowForm((v) => !v);
                    }}
                  >
                    {showForm && editing === null
                      ? tc("cancel")
                      : `＋ ${t("triggers.new")}`}
                  </Button>
                )}
              </div>

              {showForm && (
                <TriggerForm
                  // Remontar al cambiar de trigger para reiniciar el form.
                  key={`${actorKey(ctx.actor)}:${editing?.id ?? "new"}`}
                  actor={ctx.actor}
                  existingKeys={existingKeys}
                  editing={editing}
                  onCancel={() => {
                    setShowForm(false);
                    setEditing(null);
                  }}
                  onSaved={() => {
                    setShowForm(false);
                    setEditing(null);
                    setReloadSignal((n) => n + 1);
                  }}
                />
              )}

              <TriggerList
                actor={ctx.actor}
                reloadSignal={reloadSignal}
                onLoaded={handleLoaded}
                onEdit={(tr) => {
                  setEditing(tr);
                  setShowForm(true);
                }}
              />
            </>
          )}
        </>
      )}
    </main>
  );
}
