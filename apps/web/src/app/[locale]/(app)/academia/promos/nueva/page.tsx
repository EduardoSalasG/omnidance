"use client";

import { useState } from "react";

import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { apiFetch } from "@/lib/api";
import { Card } from "@/components/ui";
import { showActionNotice } from "@/components/ui/action-notice";
import { AcademyGate } from "@/components/academy/academy-gate";
import { ConsoleHeader } from "@/components/console/console-header";
import { readError } from "@/components/academy/shared";
import {
  AcademyPromoForm,
  EMPTY_ACADEMY_PROMO,
} from "@/components/academy/academy-promo-form";

/**
 * /academia/promos/nueva - creación dedicada (console-patterns:
 * CTA → página, nunca inline/modal).
 */
export default function AcademiaPromoNuevaPage() {
  const t = useTranslations("academyPromos");
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 pt-3 pb-6 sm:px-6 lg:max-w-none lg:px-4">
      <ConsoleHeader backHref="/academia/promos" backLabel={t("title")} />
      <AcademyGate>
        {({ academy }) => (
          <section className="flex flex-col gap-4">
            <h2 className="text-lg font-semibold">{t("newTitle")}</h2>
            <Card className="p-4">
              <AcademyPromoForm
                academyId={academy.id}
                initial={EMPTY_ACADEMY_PROMO}
                submitLabel={t("create")}
                busy={busy}
                onSubmit={async (body) => {
                  setBusy(true);
                  const res = await apiFetch(`/academies/${academy.id}/promos`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(body),
                  }).catch(() => null);
                  setBusy(false);
                  if (!res || !res.ok) {
                    showActionNotice({ text: res ? ((await readError(res)) ?? t("error")) : t("error"), error: true });
                    return;
                  }
                  const created = (await res.json()) as { id: string };
                  // Navega a la ficha: aviso global que sobrevive el push.
                  showActionNotice({ text: t("saved") });
                  router.push(`/academia/promos/${created.id}`);
                }}
              />
            </Card>
          </section>
        )}
      </AcademyGate>
    </main>
  );
}
