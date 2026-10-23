"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Card } from "@/components/ui";
import { AdminGate } from "@/components/admin/admin-gate";
import { ConsoleHeader } from "@/components/console/console-header";
import { useRouter } from "@/i18n/navigation";
import { readError } from "@/components/academy/shared";
import { EMPTY_PROMO, PromoForm } from "@/components/admin/promo-form";

/** /admin/facturacion/promos/nueva - crear = página dedicada (patrón consola). */
export default function NuevaPromoPage() {
  const t = useTranslations("admin.promos");
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6 pb-6">
      <ConsoleHeader backHref="/admin/facturacion/promos" backLabel={t("title")} />
      <AdminGate>
        <NewPromoPanel />
      </AdminGate>
    </main>
  );
}

function NewPromoPanel() {
  const t = useTranslations("admin.promos");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create(body: Record<string, unknown>) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch("/admin/platform-promos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        setError((await readError(res)) ?? t("error"));
        return;
      }
      router.push("/admin/facturacion/promos");
    } catch {
      setError(t("error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold">{t("newTitle")}</h2>
      <Card>
        <PromoForm
          initial={EMPTY_PROMO}
          submitLabel={t("create")}
          onSubmit={create}
          busy={busy}
        />
      </Card>
      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}
    </section>
  );
}
