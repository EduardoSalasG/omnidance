"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import {
  Badge,
  Card,
  PillTabs,
  SkeletonList,
  type BadgeVariant,
} from "@/components/ui";
import { Spinner } from "@/components/ui/spinner";
import { AdminGate } from "@/components/admin/admin-gate";
import { ConsoleHeader } from "@/components/console/console-header";
import { inputCls } from "@/components/academy/shared";
import { FilterBar } from "@/components/query/FilterBar";
import { entityDef, type QueryFilters } from "@omnidance/shared";

// ── Contratos (spec admin-finance-console) ────────────────────────────

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

type AccrualRow = {
  actorType: "PRODUCER" | "ACADEMY" | "VENUE";
  actorId: string;
  actorName: string;
  oldestPaymentAt: string;
  paymentCount: number;
  gross: number;
  estimatedNet: number;
  ownMethodReceivable: number;
};

type PayoutLineRow = {
  id: string;
  paymentId: string | null;
  type: string;
  amount: number;
};

type PayoutRow = {
  id: string;
  actorType: string;
  actorId: string;
  periodStart: string;
  periodEnd: string;
  gross: number;
  platformFee: number;
  gatewayFee: number;
  net: number;
  status: "PENDING" | "APPROVED" | "PAID";
  paidAt: string | null;
  evidenceUrl: string | null;
  createdAt: string;
  lines: PayoutLineRow[];
};

type PaymentRow = {
  id: string;
  amount: number;
  status: string;
  orderType: string;
  createdAt: string;
  gateway: string | null;
  feeMode: string | null;
  platformFeeRate: number | null;
  producerNetClp: number | null;
  gatewayFeeExpected: number | null;
  person: { id: string; name: string } | null;
  event: { id: string; name: string } | null;
};

type Mrr = {
  mrr: number;
  arr: number;
  customContracts: number;
  byTier: { kind: string; tierCode: string; count: number; monthlyAmount: number }[];
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

const clp = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});
const num = new Intl.NumberFormat("es-CL");
const dateFmt = new Intl.DateTimeFormat("es-CL", { dateStyle: "medium" });
const dateTimeFmt = new Intl.DateTimeFormat("es-CL", {
  dateStyle: "medium",
  timeStyle: "short",
});

const PAYOUT_VARIANT: Record<string, BadgeVariant> = {
  PENDING: "outline",
  APPROVED: "neon",
  PAID: "outline",
};

type Tab = "payouts" | "accrual" | "payments" | "saas";
const TABS: Tab[] = ["payouts", "accrual", "payments", "saas"];
const ACTOR_TYPES = ["PRODUCER", "ACADEMY", "VENUE"] as const;

// Filtros = EntityDef del catálogo compartido (spec analytics/query-console):
// mismos params que /query/run. `payments` va a /admin/browse/payments
// (status/orderType/from/to whitelists del engine); `payouts` va a
// /admin/payouts que ya acepta actorType/status - el rango from/to se
// aplica en cliente sobre periodStart porque ese controller vive fuera
// del módulo admin y no recibe params de fecha.
const PAYOUTS_DEF = entityDef("ADMIN", "payouts");
const PAYMENTS_DEF = entityDef("ADMIN", "payments");

function isoDay(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default function AdminFinanzasPage() {
  const t = useTranslations("admin");
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6 pb-6">
      <ConsoleHeader backHref="/admin" backLabel={t("title")} />
      <AdminGate>
        <FinancePanel />
      </AdminGate>
    </main>
  );
}

function FinancePanel() {
  const t = useTranslations("admin");
  const ta = useTranslations("analytics");
  const [tab, setTab] = useState<Tab>("payouts");

  const statusLabel = (s: string) =>
    ta.has(`statusLabels.${s}`) ? ta(`statusLabels.${s}`) : s;
  const lineTypeLabel = (s: string) =>
    t.has(`finance.lineTypes.${s}`) ? t(`finance.lineTypes.${s}`) : s;
  const actorLabel = (s: string) =>
    t.has(`finance.actorTypes.${s}`) ? t(`finance.actorTypes.${s}`) : s;
  const feeModeLabel = (s: string | null) =>
    s == null
      ? t("finance.feeModes.LEGACY")
      : t.has(`finance.feeModes.${s}`)
        ? t(`finance.feeModes.${s}`)
        : s;
  const subStatusLabel = (s: string) =>
    t.has(`finance.subStatuses.${s}`) ? t(`finance.subStatuses.${s}`) : s;

  // ── Summary (KPIs del período) ──────────────────────────────────────

  const [from, setFrom] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  });
  const [to, setTo] = useState(() => isoDay(new Date()));
  const [summary, setSummary] = useState<Summary | null>(null);
  const [summaryPhase, setSummaryPhase] = useState<
    "loading" | "ready" | "error"
  >("loading");

  const loadSummary = useCallback(async () => {
    setSummaryPhase("loading");
    try {
      const res = await apiFetch(
        `/admin/finance/summary?from=${from}&to=${to}`,
      );
      if (!res.ok) return setSummaryPhase("error");
      setSummary(await res.json());
      setSummaryPhase("ready");
    } catch {
      setSummaryPhase("error");
    }
  }, [from, to]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  // ── Datos por tab (carga perezosa) ──────────────────────────────────

  const [payouts, setPayouts] = useState<PayoutRow[] | null>(null);
  const [accrual, setAccrual] = useState<AccrualRow[] | null>(null);
  const [payments, setPayments] = useState<PaymentRow[] | null>(null);
  const [mrr, setMrr] = useState<Mrr | null>(null);
  const [tabError, setTabError] = useState(false);

  // Filtros de las dos listas consultables - auto-aplican vía los
  // useCallback de carga (cambiar un filtro recrea el loader → refetch).
  // payments arranca en PAID: es la vista histórica actual del tab.
  const [payoutsFilters, setPayoutsFilters] = useState<QueryFilters>({});
  const [paymentsFilters, setPaymentsFilters] = useState<QueryFilters>({
    status: "PAID",
  });

  const loadPayouts = useCallback(async () => {
    const params = new URLSearchParams();
    for (const k of ["actorType", "status"] as const) {
      const v = payoutsFilters[k];
      if (v) params.set(k, v);
    }
    const qs = params.toString();
    const res = await apiFetch(`/admin/payouts${qs ? `?${qs}` : ""}`);
    if (!res.ok) return setTabError(true);
    setPayouts(await res.json());
  }, [payoutsFilters]);
  const loadAccrual = useCallback(async () => {
    const res = await apiFetch("/admin/finance/accrual");
    if (!res.ok) return setTabError(true);
    setAccrual(await res.json());
  }, []);
  const loadPayments = useCallback(async () => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(paymentsFilters)) {
      if (v) params.set(k, v);
    }
    const res = await apiFetch(`/admin/browse/payments?${params}`);
    if (!res.ok) return setTabError(true);
    setPayments(await res.json());
  }, [paymentsFilters]);
  const loadMrr = useCallback(async () => {
    const res = await apiFetch("/admin/finance/mrr");
    if (!res.ok) return setTabError(true);
    setMrr(await res.json());
  }, []);

  useEffect(() => {
    setTabError(false);
    if (tab === "payouts") void loadPayouts();
    if (tab === "accrual") void loadAccrual();
    if (tab === "payments") void loadPayments();
    if (tab === "saas") void loadMrr();
  }, [tab, loadPayouts, loadAccrual, loadPayments, loadMrr]);

  // ── Operación del ciclo de payout ───────────────────────────────────

  const [expanded, setExpanded] = useState<string | null>(null);
  const [evidence, setEvidence] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function approve(id: string) {
    setBusy(id);
    try {
      const res = await apiFetch(`/admin/payouts/${id}/approve`, {
        method: "POST",
      });
      if (res.ok) await loadPayouts();
    } finally {
      setBusy(null);
    }
  }

  async function pay(id: string) {
    setBusy(id);
    try {
      const res = await apiFetch(`/admin/payouts/${id}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ evidenceUrl: evidence[id] || undefined }),
      });
      if (res.ok) {
        await loadPayouts();
        void loadSummary();
      }
    } finally {
      setBusy(null);
    }
  }

  async function generate(actor: AccrualRow) {
    setBusy(`gen-${actor.actorId}`);
    setNotice(null);
    try {
      const res = await apiFetch("/admin/payouts/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actorType: actor.actorType,
          actorId: actor.actorId,
          periodStart: actor.oldestPaymentAt,
          periodEnd: new Date().toISOString(),
        }),
      });
      if (res.ok) {
        setNotice(t("finance.generated", { name: actor.actorName }));
        await loadAccrual();
        await loadPayouts();
        void loadSummary();
      } else {
        setNotice(t("finance.generateError"));
      }
    } finally {
      setBusy(null);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────

  // /admin/payouts no recibe from/to (controller fuera del módulo admin):
  // el rango del FilterBar se aplica en cliente sobre periodStart.
  const inPayoutRange = (p: PayoutRow) => {
    const d = p.periodStart.slice(0, 10);
    if (payoutsFilters.from && d < payoutsFilters.from) return false;
    if (payoutsFilters.to && d > payoutsFilters.to) return false;
    return true;
  };
  const visiblePayouts = payouts?.filter(inPayoutRange) ?? null;

  const gmvTotal = summary
    ? summary.gmv.social + summary.gmv.academy + summary.gmv.saas
    : 0;
  const toTransfer = summary
    ? summary.pendingPayout.pending.net + summary.pendingPayout.approved.net
    : 0;

  return (
    <>
      {/* KPIs del período */}
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs text-ink/50">
            {t("finance.from")}
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className={`${inputCls} w-36`}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-ink/50">
            {t("finance.to")}
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className={`${inputCls} w-36`}
            />
          </label>
        </div>
        {summaryPhase === "loading" ? (
          <SkeletonList items={2} />
        ) : summaryPhase === "error" || !summary ? (
          <p className="text-sm text-ink/50">{t("finance.loadError")}</p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Kpi
              label={t("finance.kpiGmv")}
              value={clp.format(gmvTotal)}
              hint={t("finance.kpiGmvHint", {
                social: clp.format(summary.gmv.social),
                academy: clp.format(summary.gmv.academy),
                saas: clp.format(summary.gmv.saas),
              })}
            />
            <Kpi
              label={t("finance.kpiRevenue")}
              value={clp.format(summary.platformRevenue.total)}
              hint={t("finance.kpiRevenueHint", {
                net: clp.format(summary.platformRevenue.net),
                vat: clp.format(summary.platformRevenue.vat),
              })}
            />
            <Kpi
              label={t("finance.kpiToTransfer")}
              value={clp.format(toTransfer)}
              hint={t("finance.kpiToTransferHint", {
                count:
                  summary.pendingPayout.pending.count +
                  summary.pendingPayout.approved.count,
              })}
            />
            <Kpi
              label={t("finance.kpiGateway")}
              value={clp.format(summary.gatewayCost)}
              hint={
                summary.gmv.ownMethod > 0
                  ? t("finance.kpiOwnMethod", {
                      amount: clp.format(summary.gmv.ownMethod),
                    })
                  : undefined
              }
            />
          </div>
        )}
      </section>

      <PillTabs
        items={TABS.map((key) => ({
          key,
          label: t(`finance.tabs.${key}`),
        }))}
        active={tab}
        onSelect={(k) => setTab(k as Tab)}
        ariaLabel={t("finance.tabsLabel")}
      />

      {notice && (
        <p className="rounded-lg bg-ink/5 px-3 py-2 text-sm text-ink/70">
          {notice}
        </p>
      )}

      {tabError && (
        <p className="text-sm text-ink/50">{t("finance.loadError")}</p>
      )}

      {/* ── Liquidaciones ── */}
      {tab === "payouts" && PAYOUTS_DEF && (
        <FilterBar
          entity={PAYOUTS_DEF}
          filters={payoutsFilters}
          onChange={setPayoutsFilters}
          options={{}}
        />
      )}
      {tab === "payouts" &&
        (payouts == null ? (
          <SkeletonList items={3} />
        ) : (visiblePayouts ?? []).length === 0 ? (
          <p className="text-sm text-ink/50">{t("finance.payoutsEmpty")}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {(visiblePayouts ?? []).map((p) => (
              <li key={p.id}>
                <Card className="flex flex-col gap-2 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">
                        {clp.format(p.net)}
                      </p>
                      <p className="text-xs text-ink/50">
                        {actorLabel(p.actorType)} ·{" "}
                        {dateFmt.format(new Date(p.periodStart))} –{" "}
                        {dateFmt.format(new Date(p.periodEnd))}
                      </p>
                    </div>
                    <Badge variant={PAYOUT_VARIANT[p.status] ?? "outline"}>
                      {statusLabel(p.status)}
                    </Badge>
                  </div>
                  <p className="text-xs text-ink/50">
                    {t("finance.payoutSplit", {
                      gross: clp.format(p.gross),
                      fees: clp.format(p.platformFee + p.gatewayFee),
                    })}
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      setExpanded(expanded === p.id ? null : p.id)
                    }
                    className="self-start text-xs text-ink/60 underline underline-offset-2"
                  >
                    {expanded === p.id
                      ? t("finance.hideLines")
                      : t("finance.showLines", { count: p.lines.length })}
                  </button>
                  {expanded === p.id && (
                    <ul className="flex flex-col gap-1 border-t border-ink/10 pt-2">
                      {groupLines(p.lines).map(([type, amount]) => (
                        <li
                          key={type}
                          className="flex justify-between text-xs"
                        >
                          <span className="text-ink/60">
                            {lineTypeLabel(type)}
                          </span>
                          <span
                            className={
                              type.startsWith("OWN_METHOD_")
                                ? "text-amber-300/90"
                                : "text-ink/80"
                            }
                          >
                            {clp.format(amount)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {p.status === "PENDING" && (
                    <button
                      type="button"
                      disabled={busy === p.id}
                      onClick={() => void approve(p.id)}
                      className="mt-1 self-start rounded-lg bg-ink/10 px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
                    >
                      {busy === p.id ? <Spinner /> : t("finance.approve")}
                    </button>
                  )}
                  {p.status === "APPROVED" && (
                    <div className="flex flex-col gap-2 border-t border-ink/10 pt-2">
                      <input
                        type="url"
                        value={evidence[p.id] ?? ""}
                        onChange={(e) =>
                          setEvidence((prev) => ({
                            ...prev,
                            [p.id]: e.target.value,
                          }))
                        }
                        placeholder={t("finance.evidencePlaceholder")}
                        className={inputCls}
                      />
                      <button
                        type="button"
                        disabled={busy === p.id}
                        onClick={() => void pay(p.id)}
                        className="self-start rounded-lg bg-ink/10 px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
                      >
                        {busy === p.id ? <Spinner /> : t("finance.markPaid")}
                      </button>
                    </div>
                  )}
                  {p.status === "PAID" && p.evidenceUrl && (
                    <a
                      href={p.evidenceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-ink/60 underline underline-offset-2"
                    >
                      {t("finance.evidence")}
                    </a>
                  )}
                </Card>
              </li>
            ))}
          </ul>
        ))}

      {/* ── Por liberar ── */}
      {tab === "accrual" &&
        (accrual == null ? (
          <SkeletonList items={3} />
        ) : accrual.length === 0 ? (
          <p className="text-sm text-ink/50">{t("finance.accrualEmpty")}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {accrual.map((a) => (
              <li key={`${a.actorType}:${a.actorId}`}>
                <Card className="flex flex-col gap-2 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">
                        {a.actorName}
                      </p>
                      <p className="text-xs text-ink/50">
                        {actorLabel(a.actorType)} ·{" "}
                        {t("finance.accrualSince", {
                          date: dateFmt.format(new Date(a.oldestPaymentAt)),
                          count: a.paymentCount,
                        })}
                      </p>
                    </div>
                    <p className="shrink-0 text-sm font-semibold">
                      {clp.format(a.estimatedNet)}
                    </p>
                  </div>
                  <p className="text-xs text-ink/50">
                    {t("finance.accrualSplit", {
                      gross: clp.format(a.gross),
                      deductions: clp.format(a.gross - a.estimatedNet),
                    })}
                  </p>
                  {a.ownMethodReceivable > 0 && (
                    <p className="text-xs text-amber-300/90">
                      {t("finance.receivable", {
                        amount: clp.format(a.ownMethodReceivable),
                      })}
                    </p>
                  )}
                  <button
                    type="button"
                    disabled={busy === `gen-${a.actorId}`}
                    onClick={() => void generate(a)}
                    className="mt-1 self-start rounded-lg bg-ink/10 px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
                  >
                    {busy === `gen-${a.actorId}` ? (
                      <Spinner />
                    ) : (
                      t("finance.generate")
                    )}
                  </button>
                </Card>
              </li>
            ))}
          </ul>
        ))}

      {/* ── Pagos ── */}
      {tab === "payments" && PAYMENTS_DEF && (
        <FilterBar
          entity={PAYMENTS_DEF}
          filters={paymentsFilters}
          onChange={setPaymentsFilters}
          options={{}}
        />
      )}
      {tab === "payments" &&
        (payments == null ? (
          <SkeletonList items={3} />
        ) : (
          <>
            <p className="text-xs text-ink/50">
              {t("finance.paymentsHint")}
            </p>
            <ul className="flex flex-col gap-3">
              {payments.map((p) => (
                <li key={p.id}>
                  <Card className="flex flex-col gap-1.5 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-semibold">
                        {clp.format(p.amount)}
                      </p>
                      <Badge variant="outline">
                        {feeModeLabel(p.feeMode)}
                      </Badge>
                    </div>
                    <p className="text-xs text-ink/50">
                      {p.person?.name} · {p.event?.name} ·{" "}
                      {dateTimeFmt.format(new Date(p.createdAt))}
                    </p>
                    <p className="text-xs text-ink/50">
                      {t("finance.paymentSplit", {
                        rate:
                          p.platformFeeRate != null
                            ? `${p.platformFeeRate}%`
                            : "—",
                        producerNet:
                          p.producerNetClp != null
                            ? clp.format(p.producerNetClp)
                            : "—",
                        gateway:
                          p.gatewayFeeExpected != null
                            ? clp.format(p.gatewayFeeExpected)
                            : "—",
                      })}
                    </p>
                  </Card>
                </li>
              ))}
            </ul>
          </>
        ))}

      {/* ── SaaS ── */}
      {tab === "saas" &&
        (mrr == null ? (
          <SkeletonList items={3} />
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3">
              <Kpi label={t("finance.mrr")} value={clp.format(mrr.mrr)} />
              <Kpi label={t("finance.arr")} value={clp.format(mrr.arr)} />
              <Kpi
                label={t("finance.customContracts")}
                value={num.format(mrr.customContracts)}
              />
            </div>
            {Object.keys(mrr.funnel).length > 0 && (
              <p className="text-xs text-ink/50">
                {Object.entries(mrr.funnel)
                  .map(([s, c]) => `${subStatusLabel(s)}: ${num.format(c)}`)
                  .join(" · ")}
              </p>
            )}
            <ul className="flex flex-col gap-3">
              {mrr.subscriptions.map((s) => (
                <li key={s.id}>
                  <Card className="flex flex-col gap-1.5 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">
                          {s.actorName}
                        </p>
                        <p className="text-xs text-ink/50">
                          {s.tierCode} · {s.billingCycle.toLowerCase()}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {s.monthlyAmount != null && (
                          <span className="text-sm font-semibold">
                            {clp.format(s.monthlyAmount)}
                            <span className="text-xs font-normal text-ink/50">
                              /{t("finance.perMonth")}
                            </span>
                          </span>
                        )}
                        <Badge
                          variant={
                            s.status === "ACTIVE" ? "neon" : "outline"
                          }
                        >
                          {subStatusLabel(s.status)}
                        </Badge>
                      </div>
                    </div>
                    {s.nextInvoiceAt && (
                      <p className="text-xs text-ink/50">
                        {t("finance.nextInvoice", {
                          date: dateFmt.format(new Date(s.nextInvoiceAt)),
                        })}
                      </p>
                    )}
                  </Card>
                </li>
              ))}
            </ul>
          </>
        ))}
    </>
  );
}

/** KPI card del header - label + monto + desglose breve. */
function Kpi({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card className="flex flex-col gap-1 p-4">
      <p className="text-xs text-ink/50">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
      {hint && <p className="text-[11px] leading-snug text-ink/40">{hint}</p>}
    </Card>
  );
}

/** Agrupa las líneas del payout por tipo para el detalle expandible. */
function groupLines(lines: PayoutLineRow[]): [string, number][] {
  const byType = new Map<string, number>();
  for (const l of lines) byType.set(l.type, (byType.get(l.type) ?? 0) + l.amount);
  return [...byType.entries()];
}
