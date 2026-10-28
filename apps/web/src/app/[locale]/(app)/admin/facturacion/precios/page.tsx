"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Button, SkeletonList } from "@/components/ui";
import { AdminGate } from "@/components/admin/admin-gate";
import { ConsoleHeader } from "@/components/console/console-header";
import { Link } from "@/i18n/navigation";
import { formatMoney } from "@/lib/intl";
import { cycleLabel, type TierPrice } from "./shared";

// Libro de precios de tiers (spec multipais-currency): listado del
// price book. Crear = CTA → /nuevo; fila → ficha /[id] para editar
// (console-patterns: nada de forms ni edición inline en el listado).

export default function AdminTierPricesPage() {
  const t = useTranslations("admin.tierPrices");
  const locale = useLocale();
  const [items, setItems] = useState<TierPrice[] | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const res = await apiFetch("/admin/tier-prices");
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { items: TierPrice[] };
      setItems(data.items);
    } catch {
      setError(true);
      setItems([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <AdminGate>
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6">
        <ConsoleHeader
          backHref="/admin/facturacion"
          backLabel={t("title")}
          actions={
            <Button size="sm" href="/admin/facturacion/precios/nuevo">
              {`＋ ${t("new")}`}
            </Button>
          }
        />
        <p className="text-sm text-ink/60">{t("subtitle")}</p>

        {items === null ? (
          <SkeletonList items={6} />
        ) : error ? (
          <p role="alert" className="text-sm text-red-400">
            <button onClick={() => void load()}>{t("retry")}</button>
          </p>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-start gap-3">
            <p className="text-sm text-ink/50">{t("empty")}</p>
            <Button
              size="sm"
              variant="secondary"
              href="/admin/facturacion/precios/nuevo"
            >
              {`＋ ${t("new")}`}
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-ink/50">
                  <th className="py-2">{t("country")}</th>
                  <th className="py-2">{t("kind")}</th>
                  <th className="py-2">{t("tier")}</th>
                  <th className="py-2">{t("cycle")}</th>
                  <th className="py-2 text-right">{t("price")}</th>
                  <th className="py-2">{t("currency")}</th>
                  <th className="py-2">{t("actions")}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((r) => (
                  <tr key={r.id} className="border-t border-line">
                    <td className="py-2 tabular-nums">{r.countryCode}</td>
                    <td className="py-2">
                      {r.kind === "ACADEMY" ? t("academy") : t("producer")}
                    </td>
                    <td className="py-2">
                      <Link
                        href={`/admin/facturacion/precios/${r.id}`}
                        className="transition-colors hover:text-neon focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon"
                      >
                        {r.displayName ?? r.tierCode}
                      </Link>
                    </td>
                    <td className="py-2">{cycleLabel(t, r.billingCycle)}</td>
                    <td className="py-2 text-right tabular-nums">
                      {formatMoney(r.price, r.currency, locale)}
                    </td>
                    <td className="py-2">{r.currency}</td>
                    <td className="py-2">
                      <Button
                        variant="ghost"
                        className="min-h-11"
                        href={`/admin/facturacion/precios/${r.id}`}
                      >
                        {t("edit")}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </AdminGate>
  );
}
