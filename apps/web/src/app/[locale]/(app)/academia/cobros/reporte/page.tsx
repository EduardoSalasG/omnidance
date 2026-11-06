"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { EntityDef, QueryFilters } from "@omnidance/shared";
import { apiFetch } from "@/lib/api";
import {
  Badge,
  Button,
  Card,
  ChevronRightIcon,
  Pager,
  RefreshIcon,
  SkeletonList,
  type BadgeVariant,
} from "@/components/ui";
import { AcademyGate } from "@/components/academy/academy-gate";
import { ConsoleHeader } from "@/components/console/console-header";
import { FilterBar } from "@/components/query/FilterBar";
import {
  dedupeOptions,
  filterQuery,
  mergeOptions,
  shortId,
  type FilterOption,
  type MembershipPlan,
} from "@/components/academy/shared";
import {
  paymentMediumLabel,
  PAYMENT_STATUS_VARIANT,
} from "@/components/payments/shared";
import { useConsolePageSize } from "@/lib/console-page-size";
import { Link } from "@/i18n/navigation";
import { formatMoney, useNumFmt, useDateFmt } from "@/lib/intl";

type ReportRow = {
  id: string;
  kind: "PAYMENT" | "CLAIM";
  personId: string;
  personName: string | null;
  planId: string | null;
  planName: string | null;
  amount: number;
  /** ISO-4217 del cobro (spec multipais-currency). */
  currency?: string;
  status: string;
  method: string | null;
  createdAt: string;
};

type BillingReport = {
  billed: number;
  payers: number;
  /** Cobrado por método del período filtrado (spec
      academy-cobros-reporte): método crudo + total + conteo. */
  byMethod: { method: string | null; amount: number; count: number }[];
  items: ReportRow[];
  total: number;
  page: number;
  pageSize: number;
};

// Vocabulario unión del reporte (Payment + PaymentClaim) - la API lo
// whitelista y cada fuente aplica solo sus valores nativos.
const REPORT_STATUSES = [
  "PAID",
  "APPROVED",
  "PENDING",
  "AWAITING",
  "REJECTED",
  "FAILED",
  "REFUNDED",
] as const;

// EntityDef local del reporte (spec analytics/query-console): misma
// semántica de filtros que el query engine, sin scope (la página ya
// fija la academia). Labels: query.filters.{status,planId,from,to}.
const REPORT_ENTITY: EntityDef = {
  entity: "academy-billing-report",
  filters: [
    { key: "status", type: "enum", options: REPORT_STATUSES },
    { key: "planId", type: "fk", source: "academyPlans" },
    { key: "from", type: "date" },
    { key: "to", type: "date" },
  ],
  columns: [],
};

// Variante de badge por estado: el claim usa el semáforo de la cola
// (APPROVED=neon, REJECTED=live, AWAITING=outline, PENDING=muted).
const STATUS_VARIANT: Record<string, BadgeVariant> = {
  ...PAYMENT_STATUS_VARIANT,
  APPROVED: "neon",
  REJECTED: "live",
  AWAITING: "outline",
};

/**
 * /academia/cobros/reporte - reporte de cobranza por período (spec
 * academy-tier-v2): destino propio del drawer del owner - sin gate de
 * feature, va por la capacidad payments (owner/staff/admin, lo refuerza
 * el API). KPIs "Facturado" y "Alumnos", sección "Métodos de pago"
 * (un KPI por método con su total), filtros período/plan/estado y
 * paginación 20 desktop / 10 mobile (FilterBar + Pager).
 */
export default function CobrosReportePage() {
  const t = useTranslations("academyPay");

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 pt-3 pb-6 sm:px-6 lg:max-w-none lg:px-4">
      <ConsoleHeader
        backHref="/academia/cobros"
        backLabel={t("detailBack")}
      />
      <AcademyGate>
        {({ academy }) => (
          <ReportModule key={academy.id} academyId={academy.id} />
        )}
      </AcademyGate>
    </main>
  );
}

function ReportModule({ academyId }: { academyId: string }) {
  const locale = useLocale();
  const t = useTranslations("academyPay");
  const tc = useTranslations("common");
  const tp = useTranslations("payments");
  const tq = useTranslations("query");
  const clpFmt = useNumFmt({
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  });
  const dateFmt = useDateFmt({
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  // pageSize responsivo (spec academy-cobros-reporte): 20 desktop /
  // 10 mobile - al cambiar vuelve a página 1.
  const pageSize = useConsolePageSize();
  const [filters, setFilters] = useState<QueryFilters>({});
  const [page, setPage] = useState(1);
  const [report, setReport] = useState<BillingReport | null>(null);
  const [state, setState] = useState<
    "loading" | "ready" | "forbidden" | "error"
  >("loading");
  // Opciones del filtro planId: GET plans + cosecha del reporte como
  // fallback cuando el rol no alcanza ese endpoint (cap payments ≠ plans).
  const [planOptions, setPlanOptions] = useState<FilterOption[]>([]);

  useEffect(() => {
    setPage(1);
  }, [pageSize]);

  const load = useCallback(async () => {
    setState("loading");
    try {
      const qs = filterQuery(filters);
      const res = await apiFetch(
        `/academies/${academyId}/billing-report${qs}${qs ? "&" : "?"}page=${page}&pageSize=${pageSize}`,
      );
      if (res.status === 401 || res.status === 403 || res.status === 404) {
        setState("forbidden");
        return;
      }
      if (!res.ok) {
        setState("error");
        return;
      }
      const data = (await res.json()) as BillingReport;
      setReport(data);
      setPlanOptions((prev) =>
        mergeOptions(
          prev,
          data.items.flatMap((r) =>
            r.planId && r.planName
              ? [{ value: r.planId, label: r.planName }]
              : [],
          ),
        ),
      );
      setState("ready");
    } catch {
      setState("error");
    }
  }, [academyId, filters, page, pageSize]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    apiFetch(`/academies/${academyId}/plans?pageSize=100`)
      .then(async (res) =>
        res.ok ? ((await res.json()) as { items: MembershipPlan[] }).items : [],
      )
      .then((plans) => {
        if (cancelled) return;
        setPlanOptions((prev) =>
          mergeOptions(
            plans.map((p) => ({ value: p.id, label: p.name })),
            prev,
          ),
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [academyId]);

  const statusLabel = useCallback(
    (r: ReportRow): string => {
      // Labels por fuente: claims usan el vocabulario de la cola
      // (academyPay.status*), pagos el de payments.status - crudo si falta.
      const CLAIM_LABEL_KEY: Record<string, string> = {
        PENDING: "statusPending",
        AWAITING: "statusAwaiting",
        APPROVED: "statusApproved",
        REJECTED: "statusRejected",
      };
      return r.kind === "CLAIM" && CLAIM_LABEL_KEY[r.status]
        ? t(CLAIM_LABEL_KEY[r.status])
        : tp.has(`status.${r.status}`)
          ? tp(`status.${r.status}`)
          : r.status;
    },
    [t, tp],
  );

  // Métodos de pago del período: etiqueta humana agrupando valores
  // crudos equivalentes (spec academy-cobros-reporte).
  const methodGroups = useMemo(() => {
    const byLabel = new Map<string, { amount: number; count: number }>();
    for (const m of report?.byMethod ?? []) {
      const label =
        paymentMediumLabel(m.method, tp) ?? t("fieldMethodOther");
      const cur = byLabel.get(label) ?? { amount: 0, count: 0 };
      cur.amount += m.amount;
      cur.count += m.count;
      byLabel.set(label, cur);
    }
    return [...byLabel.entries()]
      .map(([label, v]) => ({ label, ...v }))
      .sort((a, b) => b.amount - a.amount);
  }, [report, tp, t]);

  if (state === "loading") return <SkeletonList />;
  if (state === "forbidden") {
    return (
      <Card className="flex flex-col items-center gap-3 py-6 text-center">
        <p className="text-sm text-ink/70">{t("report.forbidden")}</p>
        <Button
          href="/academia/cobros"
          variant="secondary"
          size="sm"
        >
          {t("detailBack")}
        </Button>
      </Card>
    );
  }
  if (state === "error") {
    return (
      <div className="flex items-center gap-3">
        <p role="alert" className="text-sm text-ink/60">
          {tc("error")}
        </p>
        <Button variant="secondary" size="sm" onClick={() => void load()}>
          <RefreshIcon /> {tc("retry")}
        </Button>
      </div>
    );
  }
  if (!report) return null;

  return (
    <div className="flex flex-col gap-6">
      <FilterBar
        entity={REPORT_ENTITY}
        filters={filters}
        onChange={(f) => {
          setFilters(f);
          setPage(1);
        }}
        options={{ academyPlans: dedupeOptions(planOptions) }}
      />

      {/* Export del reporte con los filtros actuales (spec
          academy-cobros-reporte): <a download> preserva la cookie vía
          el proxy /api; filename y contenido localizados por `lang`. */}
      <div className="flex items-center justify-end gap-2">
        <span className="text-xs text-ink/50">{t("report.export")}</span>
        {(["csv", "pdf"] as const).map((f) => {
          const qs = filterQuery(filters);
          return (
            <a
              key={f}
              href={`/api/academies/${academyId}/billing-report.${f}${qs}${qs ? "&" : "?"}lang=${locale.startsWith("en") ? "en" : "es"}`}
              download
              className={`inline-flex min-h-11 min-w-16 items-center justify-center rounded-xl border px-4 text-xs font-bold uppercase tracking-wide transition-colors ${
                f === "csv"
                  ? "border-line bg-surface text-ink hover:border-neon/60"
                  : "border-neon/40 bg-neon/10 text-neon hover:border-neon/70"
              }`}
            >
              {f}
            </a>
          );
        })}
      </div>

      {/* KPIs del período filtrado: solo Facturado y Alumnos (los
          títulos largos se cortaban). */}
      <ul className="grid grid-cols-2 gap-3">
        <li>
          <Card
            className="flex h-full flex-col gap-1 p-4"
            title={t("report.billedHint")}
            aria-label={`${t("report.billed")}: ${clpFmt.format(report.billed)}. ${t("report.billedHint")}`}
          >
            <span className="truncate text-xs font-medium uppercase tracking-wide text-ink/50">
              {t("report.billed")}
            </span>
            <span className="text-3xl font-bold leading-none text-neon">
              {clpFmt.format(report.billed)}
            </span>
            <span className="text-[11px] leading-tight text-ink/50">
              {t("report.billedHint")}
            </span>
          </Card>
        </li>
        <li>
          <Card
            className="flex h-full flex-col gap-1 p-4"
            title={t("report.payersHint")}
            aria-label={`${t("report.payers")}: ${report.payers}. ${t("report.payersHint")}`}
          >
            <span className="truncate text-xs font-medium uppercase tracking-wide text-ink/50">
              {t("report.payers")}
            </span>
            <span className="text-3xl font-bold leading-none text-neon">
              {report.payers}
            </span>
            <span className="text-[11px] leading-tight text-ink/50">
              {t("report.payersHint")}
            </span>
          </Card>
        </li>
      </ul>

      {/* Métodos de pago: un KPI por método con su total cobrado en el
          período filtrado (PAID + APPROVED). */}
      {methodGroups.length > 0 && (
        <section
          aria-label={t("report.methodsTitle")}
          className="flex flex-col gap-3"
        >
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink/50">
            {t("report.methodsTitle")}
          </h2>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {methodGroups.map((m) => (
              <li key={m.label}>
                <Card
                  className="flex h-full flex-col gap-1 p-4"
                  title={t("report.methodsHint")}
                  aria-label={`${m.label}: ${clpFmt.format(m.amount)}. ${t("report.methodsHint")}`}
                >
                  <span className="truncate text-xs font-medium uppercase tracking-wide text-ink/50">
                    {m.label}
                  </span>
                  <span className="text-2xl font-bold leading-none text-neon">
                    {clpFmt.format(m.amount)}
                  </span>
                  <span className="text-[11px] leading-tight text-ink/50">
                    {t("report.methodCount", { count: m.count })}
                  </span>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Lista de cobros del período: cada card navega a su detalle
          (pago de pasarela o comprobante de la cola) con ?from= para
          que el back vuelva acá. */}
      {report.items.length === 0 ? (
        <p role="status" className="text-sm text-ink/50">
          {/* Con filtros activos el empty es de la consulta, no del
              período - mismo vocabulario que el resto de la consola. */}
          {Object.keys(filters).length > 0 ? tq("empty") : t("report.empty")}
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {report.items.map((r) => (
            <li key={`${r.kind}-${r.id}`}>
              <Link
                href={
                  r.kind === "CLAIM"
                    ? `/academia/cobros/claim/${r.id}?from=/academia/cobros/reporte`
                    : `/academia/cobros/pago/${r.id}?from=/academia/cobros/reporte`
                }
                className="block rounded-xl transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon active:scale-[0.99]"
              >
                {/* Card de 4 líneas legibles: nombre, plan, método,
                    fecha; monto + chip de estado a la derecha. */}
                <Card className="flex h-full flex-col gap-1.5 p-4 transition-colors hover:border-neon/60">
                  <div className="flex items-start justify-between gap-3">
                    <span className="min-w-0 truncate text-sm font-semibold">
                      {r.personName ?? shortId(r.personId)}
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      <span className="text-sm font-semibold tabular-nums">
                        {formatMoney(r.amount, r.currency, locale)}
                      </span>
                      <ChevronRightIcon className="h-4 w-4 shrink-0 text-ink/40" />
                    </span>
                  </div>
                  <span className="truncate text-sm text-ink/70">
                    {r.planName ?? t("fieldPlanOther")}
                  </span>
                  <span className="truncate text-sm text-ink/70">
                    {paymentMediumLabel(r.method, tp) ??
                      t("fieldMethodOther")}
                  </span>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs tabular-nums text-ink/50">
                      {dateFmt.format(new Date(r.createdAt))}
                    </span>
                    <Badge variant={STATUS_VARIANT[r.status] ?? "muted"}>
                      {statusLabel(r)}
                    </Badge>
                  </div>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <Pager
        page={report.page}
        pageSize={report.pageSize}
        total={report.total}
        onPage={setPage}
      />
    </div>
  );
}
