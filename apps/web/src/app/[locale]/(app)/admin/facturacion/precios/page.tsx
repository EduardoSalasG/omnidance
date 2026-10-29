"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Badge, Button, Card, SkeletonList } from "@/components/ui";
import { inputCls } from "@/components/academy/shared";
import { AdminGate } from "@/components/admin/admin-gate";
import { ConsoleHeader } from "@/components/console/console-header";
import { Link } from "@/i18n/navigation";
import { formatMoney } from "@/lib/intl";
import { cycleLabel, tierLabel, type TierPrice } from "./shared";

// Libro de precios de tiers (spec multipais-currency): listado del
// price book. Crear = CTA → /nuevo; card → ficha /[id] para editar
// (console-patterns: nada de forms ni edición inline en el listado).
// Filtros país (catálogo /cities/catalog) + línea → query params de
// GET /admin/tier-prices.

type CountryOption = { code: string; name: string };
type CountryCatalog = CountryOption & {
  currency: string;
  cities: { id: string; name: string }[];
};

export default function AdminTierPricesPage() {
  const t = useTranslations("admin.tierPrices");
  const tq = useTranslations("query");
  const locale = useLocale();
  const [items, setItems] = useState<TierPrice[] | null>(null);
  const [error, setError] = useState(false);
  const [countries, setCountries] = useState<CountryOption[]>([]);
  const [countryCode, setCountryCode] = useState("");
  const [kind, setKind] = useState("");

  // Catálogo de países para el filtro (público, mismo que usa el alta
  // de academia). Si falla se rellena con los códigos ya presentes en
  // el libro - el filtro nunca queda ciego.
  useEffect(() => {
    let cancelled = false;
    apiFetch("/cities/catalog")
      .then(async (res) => {
        if (!res.ok || cancelled) return;
        const catalog = (await res.json()) as CountryCatalog[];
        if (cancelled) return;
        setCountries(catalog.map((c) => ({ code: c.code, name: c.name })));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const load = useCallback(async () => {
    setError(false);
    try {
      const params = new URLSearchParams();
      if (countryCode) params.set("countryCode", countryCode);
      if (kind) params.set("kind", kind);
      const qs = params.toString();
      const res = await apiFetch(
        `/admin/tier-prices${qs ? `?${qs}` : ""}`,
      );
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { items: TierPrice[] };
      setItems(data.items);
    } catch {
      setError(true);
      setItems([]);
    }
  }, [countryCode, kind]);

  useEffect(() => {
    void load();
  }, [load]);

  // Opciones del filtro de país: catálogo + cualquier código del libro
  // que el catálogo no declare (mercado sin ciudades cargadas).
  const countryOptions = useMemo(() => {
    const byCode = new Map(countries.map((c) => [c.code, c.name]));
    for (const r of items ?? []) {
      if (!byCode.has(r.countryCode)) byCode.set(r.countryCode, r.countryCode);
    }
    return [...byCode.entries()]
      .map(([code, name]) => ({ code, name }))
      .sort((a, b) => a.name.localeCompare(b.name, "es"));
  }, [countries, items]);

  const filtered = countryCode !== "" || kind !== "";
  const kindLabel = (k: TierPrice["kind"]) =>
    k === "ACADEMY" ? t("academy") : t("producer");

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

        <section
          aria-label={tq("filtersLabel")}
          className="grid grid-cols-2 gap-3"
        >
          <label className="flex min-w-0 flex-col gap-1">
            <span className="text-xs text-ink/50">{t("country")}</span>
            <select
              className={`${inputCls} min-w-0`}
              value={countryCode}
              onChange={(e) => setCountryCode(e.target.value)}
            >
              <option value="">{tq("filtersAll")}</option>
              {countryOptions.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-0 flex-col gap-1">
            <span className="text-xs text-ink/50">{t("kind")}</span>
            <select
              className={`${inputCls} min-w-0`}
              value={kind}
              onChange={(e) => setKind(e.target.value)}
            >
              <option value="">{tq("filtersAll")}</option>
              <option value="ACADEMY">{t("academy")}</option>
              <option value="PRODUCER">{t("producer")}</option>
            </select>
          </label>
        </section>

        {items === null ? (
          <SkeletonList items={6} />
        ) : error ? (
          <p role="alert" className="text-sm text-red-400">
            <button onClick={() => void load()}>{t("retry")}</button>
          </p>
        ) : items.length === 0 ? (
          filtered ? (
            <Card className="py-10 text-center">
              <p role="status" className="text-ink/70">
                {tq("empty")}
              </p>
            </Card>
          ) : (
            <p className="text-sm text-ink/50">{t("empty")}</p>
          )
        ) : (
          <ul className="flex flex-col gap-3 lg:grid lg:grid-cols-2">
            {items.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/admin/facturacion/precios/${r.id}`}
                  className="block"
                >
                  <Card className="flex flex-col gap-2 transition-colors hover:border-neon/60">
                    <div className="flex items-start justify-between gap-2">
                      <h2 className="min-w-0 flex-1 truncate font-semibold">
                        {tierLabel(r)}
                      </h2>
                      <Badge variant="outline">{kindLabel(r.kind)}</Badge>
                    </div>
                    <p className="text-sm font-semibold tabular-nums">
                      {formatMoney(r.price, r.currency, locale)}{" "}
                      <span className="text-xs font-normal text-ink/50">
                        · {cycleLabel(t, r.billingCycle)}
                      </span>
                    </p>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink/50">
                      <span className="tabular-nums">{r.tierCode}</span>
                      <span className="tabular-nums">{r.countryCode}</span>
                    </div>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </AdminGate>
  );
}
