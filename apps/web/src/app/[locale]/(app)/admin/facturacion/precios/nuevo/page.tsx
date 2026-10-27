"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { readError, inputCls } from "@/components/academy/shared";
import { Button, Card } from "@/components/ui";
import { AdminGate } from "@/components/admin/admin-gate";
import { ConsoleHeader } from "@/components/console/console-header";
import { useRouter } from "@/i18n/navigation";
import { CYCLES, cycleLabel, TIERS } from "../shared";

// Alta de una fila del price book (spec multipais-currency): página
// dedicada del CTA del listado (console-patterns: crear = CTA → página).
// Tras el aviso breve de éxito vuelve al listado.

export default function AdminTierPriceNewPage() {
  const t = useTranslations("admin.tierPrices");
  const tc = useTranslations("common");
  const router = useRouter();
  const [form, setForm] = useState({
    tierCode: "COBROS",
    kind: "ACADEMY" as "ACADEMY" | "PRODUCER",
    billingCycle: "MONTHLY" as (typeof CYCLES)[number],
    countryCode: "CL",
    price: "",
    currency: "CLP",
  });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [created, setCreated] = useState(false);

  const create = async () => {
    const price = Number.parseInt(form.price, 10);
    if (!Number.isFinite(price) || price < 0 || form.countryCode.length !== 2)
      return;
    setBusy(true);
    setNotice(null);
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
      setCreated(true);
      setTimeout(() => router.push("/admin/facturacion/precios"), 1200);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : t("exists"));
    } finally {
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

        {created ? (
          <Card className="p-6 text-center">
            <p role="status" className="text-lg font-bold text-neon">
              {notice}
            </p>
          </Card>
        ) : (
          <>
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
              <Button onClick={() => void create()} disabled={busy}>
                {busy ? tc("loading") : t("create")}
              </Button>
            </Card>
          </>
        )}
      </main>
    </AdminGate>
  );
}
