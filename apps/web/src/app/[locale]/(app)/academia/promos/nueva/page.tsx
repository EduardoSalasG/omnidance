"use client";

import { useState } from "react";

import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { apiFetch } from "@/lib/api";
import { Card } from "@/components/ui";
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
  const [error, setError] = useState<string | null>(null);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 sm:px-6 lg:max-w-3xl lg:px-8">
      <ConsoleHeader backHref="/academia/promos" backLabel={t("title")} />
      <AcademyGate>
        {({ academy }) => (
          <section className="flex flex-col gap-4">
            <h2 className="text-lg font-semibold">{t("newTitle")}</h2>
            {error && (
              <p role="alert" className="text-sm text-red-400">
                {error}
              </p>
            )}
            <Card className="p-4">
              <AcademyPromoForm
                academyId={academy.id}
                initial={EMPTY_ACADEMY_PROMO}
                submitLabel={t("create")}
                busy={busy}
                onSubmit={async (body) => {
                  setBusy(true);
                  setError(null);
                  const res = await apiFetch(`/academies/${academy.id}/promos`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(body),
                  }).catch(() => null);
                  setBusy(false);
                  if (!res || !res.ok) {
                    setError(res ? ((await readError(res)) ?? t("error")) : t("error"));
                    return;
                  }
                  const created = (await res.json()) as { id: string };
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
