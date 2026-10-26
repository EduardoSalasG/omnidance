"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { readError, inputCls } from "@/components/academy/shared";
import { Button, Card, SkeletonList } from "@/components/ui";
import { AdminGate } from "@/components/admin/admin-gate";
import { ConsoleHeader } from "@/components/console/console-header";
import { formatMoney } from "@/lib/intl";

// Libro de precios de tiers (spec multipais-currency): CRUD mínimo de
// TierPrice - el resolver chargeSpec lee actor→CL→param, así que cada
// fila es el precio del ciclo para ese país, en unidad menor.

type TierPrice = {
  id: string;
  tierCode: string;
  kind: "ACADEMY" | "PRODUCER";
  billingCycle: "MONTHLY" | "SEMIANNUAL" | "ANNUAL";
  countryCode: string;
  price: number;
  currency: string;
};

const TIERS = [
  "COBROS",
  "STUDIO",
  "PRO",
  "PRO_STARTER",
  "PRO_GROWTH",
  "PRO_BIG",
  "ENTERPRISE",
  "SOCIAL_PASS",
] as const;
const CYCLES = ["MONTHLY", "SEMIANNUAL", "ANNUAL"] as const;

export default function AdminTierPricesPage() {
  const t = useTranslations("admin.tierPrices");
  const locale = useLocale();
  const [items, setItems] = useState<TierPrice[] | null>(null);
  const [error, setError] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Form de alta (crear = sección propia sobre el listado, patrón consola).
  const [form, setForm] = useState({
    tierCode: "COBROS",
    kind: "ACADEMY" as "ACADEMY" | "PRODUCER",
    billingCycle: "MONTHLY" as (typeof CYCLES)[number],
    countryCode: "CL",
    price: "",
    currency: "CLP",
  });
  // Edición: solo precio/moneda cambian - la clave no se renumera.
  const [edits, setEdits] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setError(false);
    try {
      const res = await apiFetch("/api/admin/tier-prices");
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

  const cycleLabel = (c: string) =>
    c === "MONTHLY"
      ? t("cycleMonthly")
      : c === "SEMIANNUAL"
        ? t("cycleSemiannual")
        : t("cycleAnnual");

  const savePrice = async (row: TierPrice) => {
    const raw = edits[row.id];
    if (raw === undefined) return;
    const price = Number.parseInt(raw, 10);
    if (!Number.isFinite(price) || price < 0) return;
    setBusy(true);
    try {
      const res = await apiFetch(`/api/admin/tier-prices/${row.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ price }),
      });
      const msg = await readError(res);
      if (!res.ok) throw new Error(msg ?? "error");
      setNotice(t("saved"));
      await load();
    } catch (e) {
      setError(true);
      setNotice(e instanceof Error ? e.message : null);
    } finally {
      setBusy(false);
    }
  };

  const create = async () => {
    const price = Number.parseInt(form.price, 10);
    if (!Number.isFinite(price) || price < 0 || form.countryCode.length !== 2)
      return;
    setBusy(true);
    try {
      const res = await apiFetch("/api/admin/tier-prices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tierCode: form.tierCode,
          kind: form.kind,
          billingCycle: form.billingCycle,
          countryCode: form.countryCode.toUpperCase(),
          price,
          currency: form.currency.toUpperCase(),
        }),
      });
      const msg = await readError(res);
      if (!res.ok) throw new Error(msg ?? "error");
      setNotice(t("created"));
      setForm((f) => ({ ...f, price: "" }));
      await load();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : t("exists"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminGate>
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6">
        <ConsoleHeader
          backHref="/admin/facturacion"
          backLabel={t("title")}
        />
        <p className="text-sm text-ink/60">{t("subtitle")}</p>

        {notice && (
          <p role="status" className="text-sm text-neon">
            {notice}
          </p>
        )}

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
                  {x}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-ink/50">
            {t("kind")}
            <select
              className={inputCls}
              value={form.kind}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  kind: e.target.value as "ACADEMY" | "PRODUCER",
                }))
              }
            >
              <option value="ACADEMY">{t("academy")}</option>
              <option value="PRODUCER">{t("producer")}</option>
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
                  billingCycle: e.target.value as (typeof CYCLES)[number],
                }))
              }
            >
              {CYCLES.map((c) => (
                <option key={c} value={c}>
                  {cycleLabel(c)}
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
          <Button onClick={() => void create()} disabled={busy}>
            {t("create")}
          </Button>
        </Card>

        {items === null ? (
          <SkeletonList items={6} />
        ) : error ? (
          <p role="alert" className="text-sm text-red-400">
            <button onClick={() => void load()}>{t("retry")}</button>
          </p>
        ) : items.length === 0 ? (
          <p className="text-sm text-ink/50">{t("empty")}</p>
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
                    <td className="py-2">{r.tierCode}</td>
                    <td className="py-2">{cycleLabel(r.billingCycle)}</td>
                    <td className="py-2 text-right tabular-nums">
                      {formatMoney(r.price, r.currency, locale)}
                      <input
                        aria-label={t("price")}
                        className={`${inputCls} ml-2 w-24`}
                        defaultValue={String(r.price)}
                        inputMode="numeric"
                        onChange={(e) =>
                          setEdits((m) => ({ ...m, [r.id]: e.target.value }))
                        }
                      />
                    </td>
                    <td className="py-2">{r.currency}</td>
                    <td className="py-2">
                      <Button
                        variant="ghost"
                        className="min-h-11"
                        disabled={busy || edits[r.id] === undefined}
                        onClick={() => void savePrice(r)}
                      >
                        {t("save")}
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
