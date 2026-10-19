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
  type BadgeVariant,
} from "@/components/ui";
import { AdminGate } from "@/components/admin/admin-gate";
import { KpiCard } from "@/components/admin/kpi-card";
import { ConsoleHeader } from "@/components/console/console-header";
import { FilterBar } from "@/components/query/FilterBar";
import { entityDef, type QueryFilters } from "@omnidance/shared";
import { useDateFmt, useNumFmt } from "@/lib/intl";

// Transacciones de la plataforma (spec admin-console-billing-nav):
// KPIs del mes corriente vía /admin/finance/summary + desglose por
// segmento + listado de pagos de /admin/browse/payments con la
// FilterBar del catálogo (misma semántica que el tab Pagos de
// /admin/finanzas). Los KPIs son del período, no del filtro.

type Summary = {
  period: { from: string; to: string };
  gmv: { social: number; academy: number; saas: number; ownMethod: number };
  platformRevenue: { net: number; vat: number; saas: number; total: number };
  gatewayCost: number;
  pendingPayout: {
    pending: { count: number; net: number };
    approved: { count: number; net: number };
  };
};

type PaymentRow = {
  id: string;
  amount: number;
  net: number;
  status: string;
  orderType: string;
  createdAt: string;
  gateway: string | null;
  platformFeeNetClp: number | null;
  platformFeeVatClp: number | null;
  person: { id: string; name: string } | null;
  event: { id: string; name: string } | null;
};

const PAYMENTS_DEF = entityDef("ADMIN", "payments");
const STATUS_VARIANT: Record<string, BadgeVariant> = {
  PAID: "neon",
  PENDING: "outline",
  FAILED: "outline",
  REFUNDED: "outline",
};

function monthStartIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

export default function AdminTransaccionesPage() {
  const t = useTranslations("admin");
  const tn = useTranslations("nav");
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6 pb-6">
      <ConsoleHeader backHref="/inicio" backLabel={tn("home")} />
      <AdminGate>
        <TransactionsPanel />
      </AdminGate>
    </main>
  );
}

function TransactionsPanel() {
  const clp = useNumFmt({
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  });
  const dateTimeFmt = useDateFmt({ dateStyle: "medium", timeStyle: "short" });
  const t = useTranslations("admin.tx");
  const ta = useTranslations("analytics");

  const statusLabel = (s: string) =>
    ta.has(`statusLabels.${s}`) ? ta(`statusLabels.${s}`) : s;
  const orderLabel = (s: string) =>
    ta.has(`orderTypes.${s}`) ? ta(`orderTypes.${s}`) : s;

  // ── KPIs del mes (período fijo, no sigue los filtros del listado) ──
  const [summary, setSummary] = useState<Summary | null>(null);
  const [summaryError, setSummaryError] = useState(false);
  const loadSummary = useCallback(async () => {
    setSummaryError(false);
    const res = await apiFetch(
      `/admin/finance/summary?from=${monthStartIso()}`,
    ).catch(() => null);
    if (!res?.ok) return setSummaryError(true);
    setSummary((await res.json()) as Summary);
  }, []);
  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  // ── Listado de pagos (auto-aplica como el resto de consolas) ──────
  const [filters, setFilters] = useState<QueryFilters>({ status: "PAID" });
  const [payments, setPayments] = useState<PaymentRow[] | null>(null);
  const [listError, setListError] = useState(false);
  const loadPayments = useCallback(async () => {
    setListError(false);
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(filters)) {
      if (v) params.set(k, v);
    }
    const res = await apiFetch(`/admin/browse/payments?${params}`).catch(
      () => null,
    );
    if (!res?.ok) return setListError(true);
    setPayments((await res.json()) as PaymentRow[]);
  }, [filters]);
  useEffect(() => {
    void loadPayments();
  }, [loadPayments]);

  const gmvTx = summary
    ? summary.gmv.social + summary.gmv.academy
    : 0;
  const feeTx = summary
    ? summary.platformRevenue.net + summary.platformRevenue.vat
    : 0;
  const toTransfer = summary
    ? summary.pendingPayout.pending.net + summary.pendingPayout.approved.net
    : 0;

  return (
    <>
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t("title")}</h2>
        <p className="text-sm text-ink/60">{t("desc")}</p>
      </section>

      {/* KPIs del mes calendario en curso */}
      <section aria-label={t("kpisLabel")} className="flex flex-col gap-3">
        {summaryError ? (
          <div className="flex items-center gap-3">
            <p role="alert" className="text-sm text-ink/60">
              {t("loadError")}
            </p>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void loadSummary()}
            >
              <RefreshIcon /> {t("retry")}
            </Button>
          </div>
        ) : summary === null ? (
          <SkeletonList items={2} />
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <KpiCard
              label={t("kpiRevenue")}
              value={clp.format(summary.platformRevenue.total)}
              hint={t("kpiRevenueHint", {
                tx: clp.format(feeTx),
                subs: clp.format(summary.platformRevenue.saas),
              })}
            />
            <KpiCard
              label={t("kpiGmv")}
              value={clp.format(gmvTx)}
              hint={t("kpiGmvHint", {
                social: clp.format(summary.gmv.social),
                academy: clp.format(summary.gmv.academy),
              })}
            />
            <KpiCard
              label={t("kpiGateway")}
              value={clp.format(summary.gatewayCost)}
              hint={
                summary.gmv.ownMethod > 0
                  ? t("kpiOwnMethod", {
                      amount: clp.format(summary.gmv.ownMethod),
                    })
                  : undefined
              }
            />
            <KpiCard
              label={t("kpiToTransfer")}
              value={clp.format(toTransfer)}
              hint={t("kpiToTransferHint", {
                count:
                  summary.pendingPayout.pending.count +
                  summary.pendingPayout.approved.count,
              })}
            />
          </div>
        )}
      </section>

      {/* Listado de transacciones con los filtros del catálogo */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-ink/80">{t("listTitle")}</h2>
        {PAYMENTS_DEF && (
          <FilterBar
            entity={PAYMENTS_DEF}
            filters={filters}
            onChange={setFilters}
            options={{}}
          />
        )}
        {listError ? (
          <div className="flex items-center gap-3">
            <p role="alert" className="text-sm text-ink/60">
              {t("loadError")}
            </p>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void loadPayments()}
            >
              <RefreshIcon /> {t("retry")}
            </Button>
          </div>
        ) : payments === null ? (
          <SkeletonList items={3} />
        ) : payments.length === 0 ? (
          <Card className="p-4 text-sm text-ink/60">{t("listEmpty")}</Card>
        ) : (
          <ul className="flex flex-col gap-2">
            {payments.map((p) => (
              <li key={p.id}>
                <Card className="flex items-center justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {p.person?.name ?? t("noPerson")}
                    </p>
                    <p className="truncate text-xs text-ink/50">
                      {orderLabel(p.orderType)}
                      {p.event?.name ? ` · ${p.event.name}` : ""} ·{" "}
                      {dateTimeFmt.format(new Date(p.createdAt))}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <div className="text-right">
                      <p className="text-sm font-semibold tabular-nums">
                        {clp.format(p.amount)}
                      </p>
                      {(p.platformFeeNetClp ?? 0) +
                        (p.platformFeeVatClp ?? 0) >
                        0 && (
                        <p className="text-xs tabular-nums text-ink/50">
                          {t("fee", {
                            amount: clp.format(
                              (p.platformFeeNetClp ?? 0) +
                                (p.platformFeeVatClp ?? 0),
                            ),
                          })}
                        </p>
                      )}
                    </div>
                    <Badge variant={STATUS_VARIANT[p.status] ?? "outline"}>
                      {statusLabel(p.status)}
                    </Badge>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
