"use client";

import { use, useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { readError, inputCls } from "@/components/academy/shared";
import { Button, Card, SkeletonCard } from "@/components/ui";
import { ActionNotice } from "@/components/ui/action-notice";
import { AdminGate } from "@/components/admin/admin-gate";
import { ConsoleHeader } from "@/components/console/console-header";
import { cycleLabel, type TierPrice } from "../shared";

// Ficha de una fila del price book (spec multipais-currency): edición de
// nombre visible/precio/moneda (la clave tier×kind×ciclo×país no se
// renumera). No hay GET /admin/tier-prices/:id - la fila se resuelve
// del listado (acotado, el libro es chico).

export default function AdminTierPriceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const t = useTranslations("admin.tierPrices");
  const tc = useTranslations("common");
  const [row, setRow] = useState<TierPrice | null>(null);
  const [state, setState] = useState<"loading" | "error" | "ok" | "notFound">(
    "loading",
  );
  const [displayName, setDisplayName] = useState("");
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{
    text: string;
    error?: boolean;
  } | null>(null);

  const load = useCallback(async () => {
    setState("loading");
    try {
      const res = await apiFetch("/admin/tier-prices");
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { items: TierPrice[] };
      const found = data.items.find((r) => r.id === id) ?? null;
      if (!found) {
        setState("notFound");
        return;
      }
      setRow(found);
      setDisplayName(found.displayName ?? "");
      setPrice(String(found.price));
      setCurrency(found.currency);
      setState("ok");
    } catch {
      setState("error");
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!row) return;
    const p = Number.parseInt(price, 10);
    if (!Number.isFinite(p) || p < 0) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await apiFetch(`/admin/tier-prices/${row.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          price: p,
          currency: currency.toUpperCase(),
          // "" limpia el nombre (PUT mapea falsy → null).
          displayName: displayName.trim(),
        }),
      });
      const msg = await readError(res);
      if (!res.ok) throw new Error(msg ?? "error");
      setNotice({ text: t("saved") });
      await load();
    } catch (e) {
      setNotice({
        text: e instanceof Error ? e.message : tc("error"),
        error: true,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminGate>
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6">
        <ActionNotice notice={notice} onDismiss={() => setNotice(null)} />
        <ConsoleHeader
          backHref="/admin/facturacion/precios"
          backLabel={t("title")}
        />

        {state === "loading" && <SkeletonCard lines={3} />}

        {state === "error" && (
          <div className="flex items-center gap-3">
            <p role="alert" className="text-sm text-red-400">
              {tc("error")}
            </p>
            <Button size="sm" variant="ghost" onClick={() => void load()}>
              {t("retry")}
            </Button>
          </div>
        )}

        {state === "notFound" && (
          <div className="flex flex-col items-start gap-3">
            <p className="text-sm text-ink/70">{t("empty")}</p>
            <Button
              href="/admin/facturacion/precios"
              variant="secondary"
              size="sm"
            >
              {t("title")}
            </Button>
          </div>
        )}

        {state === "ok" && row && (
          <>
            <h2 className="text-xl font-semibold">
              {row.tierCode} · {row.countryCode}
            </h2>

            <Card className="flex flex-col gap-4">
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-xs text-ink/50">{t("kind")}</dt>
                  <dd>
                    {row.kind === "ACADEMY" ? t("academy") : t("producer")}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-ink/50">{t("cycle")}</dt>
                  <dd>{cycleLabel(t, row.billingCycle)}</dd>
                </div>
              </dl>
              <div className="flex flex-wrap items-end gap-2">
                <label className="flex min-w-40 flex-1 flex-col gap-1 text-xs text-ink/50">
                  {t("displayName")}
                  <input
                    className={inputCls}
                    value={displayName}
                    maxLength={60}
                    placeholder={row.tierCode}
                    onChange={(e) => setDisplayName(e.target.value)}
                  />
                </label>
                <label className="flex w-28 flex-col gap-1 text-xs text-ink/50">
                  {t("price")}
                  <input
                    className={inputCls}
                    value={price}
                    inputMode="numeric"
                    onChange={(e) => setPrice(e.target.value)}
                  />
                </label>
                <label className="flex w-20 flex-col gap-1 text-xs text-ink/50">
                  {t("currency")}
                  <input
                    className={inputCls}
                    value={currency}
                    maxLength={3}
                    onChange={(e) => setCurrency(e.target.value)}
                  />
                </label>
                <Button onClick={() => void save()} disabled={busy}>
                  {busy ? tc("loading") : t("save")}
                </Button>
              </div>
            </Card>
          </>
        )}
      </main>
    </AdminGate>
  );
}
