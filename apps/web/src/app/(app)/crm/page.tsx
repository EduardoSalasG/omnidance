"use client";

import { useTranslations } from "next-intl";
import {
  ActorPicker,
  CrmGateScreen,
  CrmNav,
  useCrmContext,
} from "@/components/crm/crm-context";
import { PeopleTable } from "@/components/crm/people-table";

// Hub del CRM: personas del actor + acceso a campañas y triggers.
export default function CrmPage() {
  const t = useTranslations("crm");
  const ctx = useCrmContext();

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 p-6 pb-24">
      <CrmNav active="people" />

      <CrmGateScreen gate={ctx.gate} onRetry={() => void ctx.boot()} />

      {ctx.gate === "ready" && (
        <>
          <ActorPicker ctx={ctx} />
          {ctx.actor ? (
            <PeopleTable actor={ctx.actor} />
          ) : (
            <p className="text-white/60">{t("pickActor")}</p>
          )}
        </>
      )}
    </main>
  );
}
