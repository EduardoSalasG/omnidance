"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import {
  Badge,
  Button,
  Card,
  RefreshIcon,
  SkeletonList,
} from "@/components/ui";
import { AdminGate } from "@/components/admin/admin-gate";
import { KpiCard } from "@/components/admin/kpi-card";
import { ConsoleHeader } from "@/components/console/console-header";
import { useDateFmt, useNumFmt } from "@/lib/intl";

// Suscripciones de plataforma (spec admin-console-billing-nav):
// MRR/ARR + activas + contratos a convenir de GET /admin/finance/mrr,
// desglose por tier, funnel de estados clickeable como filtro del
// listado y la lista de suscripciones.

type Mrr = {
  mrr: number;
  arr: number;
  customContracts: number;
  byTier: {
    kind: string;
    tierCode: string;
    count: number;
    monthlyAmount: number;
  }[];
  funnel: Record<string, number>;
  subscriptions: {
    id: string;
    kind: string;
    actorId: string;
    actorName: string;
    tierCode: string;
    billingCycle: string;
    status: string;
    monthlyAmount: number | null;
    nextInvoiceAt: string | null;
  }[];
};

export default function AdminSuscripcionesPage() {
  const t = useTranslations("admin");
  const tn = useTranslations("nav");
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6 pb-6">
      <ConsoleHeader backHref="/inicio" backLabel={tn("home")} />
      <AdminGate>
        <SubscriptionsPanel />
      </AdminGate>
    </main>
  );
}

function SubscriptionsPanel() {
  const clp = useNumFmt({
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  });
  const num = useNumFmt();
  const dateFmt = useDateFmt({ dateStyle: "medium" });
  const t = useTranslations("admin.subs");

  const [mrr, setMrr] = useState<Mrr | null>(null);
  const [error, setError] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(false);
    const res = await apiFetch("/admin/finance/mrr").catch(() => null);
    if (!res?.ok) return setError(true);
    setMrr((await res.json()) as Mrr);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const subs = mrr?.subscriptions ?? [];
  const visible = statusFilter
    ? subs.filter((s) => s.status === statusFilter)
    : subs;
  const activeCount = mrr?.funnel["ACTIVE"] ?? 0;
  const kindLabel = (k: string) =>
    t.has(`kind.${k}`) ? t(`kind.${k}`) : k;
  const statusLabel = (s: string) =>
    t.has(`status.${s}`) ? t(`status.${s}`) : s;
  const cycleLabel = (c: string) =>
    t.has(`cycle.${c}`) ? t(`cycle.${c}`) : c.toLowerCase();

  return (
    <>
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t("title")}</h2>
        <p className="text-sm text-ink/60">{t("desc")}</p>
      </section>

      {error ? (
        <div className="flex items-center gap-3">
          <p role="alert" className="text-sm text-ink/60">
            {t("loadError")}
          </p>
          <Button variant="secondary" size="sm" onClick={() => void load()}>
            <RefreshIcon /> {t("retry")}
          </Button>
        </div>
      ) : mrr === null ? (
        <SkeletonList items={3} />
      ) : (
        <>
          {/* KPIs SaaS */}
          <section aria-label={t("kpisLabel")}>
            <div className="grid grid-cols-2 gap-3">
              <KpiCard label={t("kpiMrr")} value={clp.format(mrr.mrr)} />
              <KpiCard label={t("kpiArr")} value={clp.format(mrr.arr)} />
              <KpiCard
                label={t("kpiActive")}
                value={num.format(activeCount)}
              />
              <KpiCard
                label={t("kpiCustom")}
                value={num.format(mrr.customContracts)}
                hint={mrr.customContracts > 0 ? t("kpiCustomHint") : undefined}
              />
            </div>
          </section>

          {/* Desglose por tier */}
          {mrr.byTier.length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className="text-sm font-semibold text-ink/80">
                {t("tiersTitle")}
              </h2>
              <Card padded={false}>
                <ul className="flex flex-col divide-y divide-line">
                  {mrr.byTier.map((r) => (
                    <li
                      key={`${r.kind}:${r.tierCode}`}
                      className="flex items-center justify-between gap-3 px-4 py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {r.tierCode}
                        </p>
                        <p className="text-xs text-ink/50">
                          {kindLabel(r.kind)} ·{" "}
                          {t("tierCount", { count: r.count })}
                        </p>
                      </div>
                      <p className="shrink-0 text-sm font-semibold tabular-nums">
                        {clp.format(r.monthlyAmount)}
                      </p>
                    </li>
                  ))}
                </ul>
              </Card>
            </section>
          )}

          {/* Funnel de estados - chips clickeables filtran la lista */}
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-ink/80">
              {t("funnelTitle")}
            </h2>
            <div className="flex flex-wrap gap-2">
              {Object.entries(mrr.funnel).map(([status, count]) => (
                <button
                  key={status}
                  type="button"
                  aria-pressed={statusFilter === status}
                  onClick={() =>
                    setStatusFilter(statusFilter === status ? null : status)
                  }
                  className={`min-h-11 rounded-full border px-3 text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon ${
                    statusFilter === status
                      ? "border-neon bg-neon/10 text-neon"
                      : "border-line text-ink/60 hover:text-ink"
                  }`}
                >
                  {statusLabel(status)} · {num.format(count)}
                </button>
              ))}
            </div>

            {visible.length === 0 ? (
              <Card className="p-4 text-sm text-ink/60">{t("listEmpty")}</Card>
            ) : (
              <ul className="flex flex-col gap-2">
                {visible.map((s) => (
                  <li key={s.id}>
                    <Card className="flex flex-col gap-1.5 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">
                            {s.actorName}
                          </p>
                          <p className="text-xs text-ink/50">
                            {kindLabel(s.kind)} · {s.tierCode} ·{" "}
                            {cycleLabel(s.billingCycle)}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          {s.monthlyAmount != null && (
                            <span className="text-sm font-semibold tabular-nums">
                              {clp.format(s.monthlyAmount)}
                              <span className="text-xs font-normal text-ink/50">
                                /{t("perMonth")}
                              </span>
                            </span>
                          )}
                          <Badge
                            variant={s.status === "ACTIVE" ? "neon" : "outline"}
                          >
                            {statusLabel(s.status)}
                          </Badge>
                        </div>
                      </div>
                      {s.nextInvoiceAt && (
                        <p className="text-xs text-ink/50">
                          {t("nextInvoice", {
                            date: dateFmt.format(new Date(s.nextInvoiceAt)),
                          })}
                        </p>
                      )}
                    </Card>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </>
  );
}
