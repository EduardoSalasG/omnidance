"use client";

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { Button, PlusIcon } from "@/components/ui";
import {
  ActorPicker,
  CrmGateScreen,
  CrmNav,
  useCrmContext,
} from "@/components/crm/crm-context";
import { TriggerList } from "@/components/crm/trigger-list";
import { ProPaywall } from "@/components/producer/pro-paywall";
import { CRM_TRIGGER_KEYS } from "@/components/crm/types";

// Listado de triggers del actor. El h1 lo provee el chrome; crear =
// CTA → /crm/triggers/nuevo y editar → /crm/triggers/[id] (patrón de
// consola - el form ya no vive inline).
export default function CrmTriggersPage() {
  const t = useTranslations("crm");
  const ctx = useCrmContext();

  const [existingKeys, setExistingKeys] = useState<string[]>([]);

  // Estable para no re-disparar el fetch de TriggerList en cada render.
  const handleLoaded = useCallback((keys: string[]) => {
    setExistingKeys(keys);
  }, []);

  const remaining = CRM_TRIGGER_KEYS.length - existingKeys.length;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6 pb-6 lg:max-w-5xl lg:px-8">
      <CrmNav active="triggers" />

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
              <div className="flex items-center justify-end gap-3">
                {remaining <= 0 && (
                  <p className="text-xs text-ink/50">
                    {t("triggers.allCreated")}
                  </p>
                )}
                {remaining > 0 && (
                  <Button
                    size="sm"
                    variant="secondary"
                    href="/crm/triggers/nuevo"
                  >
                    <PlusIcon className="h-4 w-4" /> {t("triggers.new")}
                  </Button>
                )}
              </div>

              <TriggerList
                actor={ctx.actor}
                reloadSignal={0}
                onLoaded={handleLoaded}
              />
            </>
          )}
        </>
      )}
    </main>
  );
}
