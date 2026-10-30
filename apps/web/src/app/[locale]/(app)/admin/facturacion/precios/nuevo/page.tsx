"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { readError, inputCls } from "@/components/academy/shared";
import { Button, Card } from "@/components/ui";
import { showActionNotice } from "@/components/ui/action-notice";
import { AdminGate } from "@/components/admin/admin-gate";
import { ConsoleHeader } from "@/components/console/console-header";
import { useRouter } from "@/i18n/navigation";
import {
  CYCLES,
  cycleLabel,
  kindForTier,
  TIER_LABELS,
  TIERS,
} from "../shared";

// Alta de una fila del price book (spec multipais-currency): página
// dedicada del CTA del listado (console-patterns: crear = CTA → página).
// La línea (kind) se deriva del tier - no es campo del form. Éxito/error
// van al ActionNotice global; tras crear vuelve al listado de una.

export default function AdminTierPriceNewPage() {
  const t = useTranslations("admin.tierPrices");
  const tc = useTranslations("common");
  const router = useRouter();
  const [form, setForm] = useState({
    tierCode: "COBROS",
    billingCycle: "MONTHLY" as (typeof CYCLES)[number],
    countryCode: "CL",
    displayName: "",
    price: "",
    currency: "CLP",
  });
  const [busy, setBusy] = useState(false);

  const create = async () => {
    const price = Number.parseInt(form.price, 10);
    if (!Number.isFinite(price) || price < 0 || form.countryCode.length !== 2)
      return;
    setBusy(true);
    try {
      const res = await apiFetch("/admin/tier-prices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tierCode: form.tierCode,
          kind: kindForTier(form.tierCode),
          billingCycle: form.billingCycle,
          countryCode: form.countryCode.toUpperCase(),
          price,
          currency: form.currency.toUpperCase(),
          ...(form.displayName.trim()
            ? { displayName: form.displayName.trim() }
            : {}),
        }),
      });
      const msg = await readError(res);
      if (!res.ok) throw new Error(msg ?? "error");
      showActionNotice({ text: t("created") });
      // busy queda en true hasta la navegación - evita doble submit.
      router.push("/admin/facturacion/precios");
    } catch (e) {
      showActionNotice({
        text: e instanceof Error ? e.message : t("exists"),
        error: true,
      });
      setBusy(false);
    }
  };

  return (
    <AdminGate>
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6">
        <ConsoleHeader
          backHref="/admin/facturacion/precios"
          backLabel={t("title")}
        />
        <h2 className="text-xl font-semibold">{t("new")}</h2>

        <Card className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs text-ink/50">
            {t("tier")}
            <select
              className={inputCls}
              value={form.tierCode}
              onChange={(e) =>
                setForm((f) => ({ ...f, tierCode: e.target.value }))
              }
            >
              {TIERS.map((x) => (
                <option key={x} value={x}>
                  {/* Nombre público + código: el label se repite entre
                      líneas (Starter/productor vs academia) y el código
                      es la clave persistida. */}
                  {TIER_LABELS[x] ? `${TIER_LABELS[x]} · ${x}` : x}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-ink/50">
            {t("cycle")}
            <select
              className={inputCls}
              value={form.billingCycle}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  billingCycle: e.target
                    .value as (typeof CYCLES)[number],
                }))
              }
            >
              {CYCLES.map((c) => (
                <option key={c} value={c}>
                  {cycleLabel(t, c)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex w-16 flex-col gap-1 text-xs text-ink/50">
            {t("country")}
            <input
              className={inputCls}
              value={form.countryCode}
              maxLength={2}
              onChange={(e) =>
                setForm((f) => ({ ...f, countryCode: e.target.value }))
              }
            />
          </label>
          <label className="flex w-28 flex-col gap-1 text-xs text-ink/50">
            {t("price")}
            <input
              className={inputCls}
              value={form.price}
              inputMode="numeric"
              onChange={(e) =>
                setForm((f) => ({ ...f, price: e.target.value }))
              }
            />
          </label>
          <label className="flex w-20 flex-col gap-1 text-xs text-ink/50">
            {t("currency")}
            <input
              className={inputCls}
              value={form.currency}
              maxLength={3}
              onChange={(e) =>
                setForm((f) => ({ ...f, currency: e.target.value }))
              }
            />
          </label>
          <label className="flex min-w-40 flex-1 flex-col gap-1 text-xs text-ink/50">
            {t("displayName")}
            <input
              className={inputCls}
              value={form.displayName}
              maxLength={60}
              placeholder={TIER_LABELS[form.tierCode] ?? form.tierCode}
              onChange={(e) =>
                setForm((f) => ({ ...f, displayName: e.target.value }))
              }
            />
          </label>
          <Button onClick={() => void create()} disabled={busy}>
            {busy ? tc("loading") : t("create")}
          </Button>
        </Card>
      </main>
    </AdminGate>
  );
}
