"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui";
import {
  ActorPicker,
  CrmGateScreen,
  CrmNav,
  useCrmContext,
} from "@/components/crm/crm-context";
import { CampaignForm } from "@/components/crm/campaign-form";
import { CampaignList } from "@/components/crm/campaign-list";
import { actorKey } from "@/components/crm/types";

export default function CrmCampanasPage() {
  const t = useTranslations("crm");
  const tc = useTranslations("common");
  const ctx = useCrmContext();

  const [showForm, setShowForm] = useState(false);
  const [reloadSignal, setReloadSignal] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-6 p-6 pb-24">
      <h1 className="text-2xl font-bold">{t("campaigns.title")}</h1>
      <CrmNav active="campaigns" />

      <CrmGateScreen gate={ctx.gate} onRetry={() => void ctx.boot()} />

      {ctx.gate === "ready" && (
        <>
          <ActorPicker ctx={ctx} />
          {!ctx.actor ? (
            <p className="text-white/60">{t("pickActor")}</p>
          ) : (
            <>
              <div className="flex justify-end">
                <Button
                  size="sm"
                  variant={showForm ? "ghost" : "secondary"}
                  onClick={() => setShowForm((v) => !v)}
                >
                  {showForm ? tc("cancel") : `＋ ${t("campaigns.new")}`}
                </Button>
              </div>

              <div aria-live="polite">
                {notice && <p className="text-sm text-neon">{notice}</p>}
              </div>

              {showForm && (
                <CampaignForm
                  key={actorKey(ctx.actor)}
                  actor={ctx.actor}
                  onCancel={() => setShowForm(false)}
                  onCreated={() => {
                    setShowForm(false);
                    setNotice(t("campaigns.created"));
                    setReloadSignal((n) => n + 1);
                  }}
                />
              )}

              <CampaignList actor={ctx.actor} reloadSignal={reloadSignal} />
            </>
          )}
        </>
      )}
    </main>
  );
}
