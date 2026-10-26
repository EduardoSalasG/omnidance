"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { EntityDef, QueryFilters } from "@omnidance/shared";
import { apiFetch } from "@/lib/api";
import {
  Badge,
  Button,
  Card,
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
import { PAYMENT_STATUS_VARIANT } from "@/components/payments/shared";
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
  topPlan: {
    planId: string;
    name: string;
    count: number;
    amount: number;
  } | null;
  items: ReportRow[];
  total: number;
  page: number;
  pageSize: number;
};

const PAGE_SIZE = 25;

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
 * academy-tier-v2): el piso del tier COBROS - sin gate de feature, va
 * por la capacidad payments (owner/staff/admin, lo refuerza el API).
 * Facturado del período + alumnos que pagaron + plan más vendido, con
 * filtros período/plan/estado y paginación (FilterBar + Pager).
 */
export default function CobrosReportePage() {
  const t = useTranslations("academyPay");

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 sm:px-6 lg:max-w-5xl lg:px-8">
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

  const [filters, setFilters] = useState<QueryFilters>({});
  const [page, setPage] = useState(1);
  const [report, setReport] = useState<BillingReport | null>(null);
  const [state, setState] = useState<
    "loading" | "ready" | "forbidden" | "error"
  >("loading");
  // Opciones del filtro planId: GET plans + cosecha del reporte como
  // fallback cuando el rol no alcanza ese endpoint (cap payments ≠ plans).
  const [planOptions, setPlanOptions] = useState<FilterOption[]>([]);

  const load = useCallback(async () => {
    setState("loading");
    try {
      const qs = filterQuery(filters);
      const res = await apiFetch(
        `/academies/${academyId}/billing-report${qs}${qs ? "&" : "?"}page=${page}&pageSize=${PAGE_SIZE}`,
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
  }, [academyId, filters, page]);

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

  if (state === "loading") return <SkeletonList />;
  if (state === "forbidden") {
    return (
      <Card className="py-6 text-center">
        <p className="text-sm text-ink/70">{t("report.forbidden")}</p>
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

  // Labels por fuente: claims usan el vocabulario de la cola
  // (academyPay.status*), pagos el de payments.status - crudo si falta.
  const CLAIM_LABEL_KEY: Record<string, string> = {
    PENDING: "statusPending",
    AWAITING: "statusAwaiting",
    APPROVED: "statusApproved",
    REJECTED: "statusRejected",
  };
  const statusLabel = (r: ReportRow): string =>
    r.kind === "CLAIM" && CLAIM_LABEL_KEY[r.status]
      ? t(CLAIM_LABEL_KEY[r.status])
      : tp.has(`status.${r.status}`)
        ? tp(`status.${r.status}`)
        : r.status;

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

      {/* KPIs del período filtrado: facturado, pagantes únicos y plan
          más vendido (solo cobros efectivos: PAID + APPROVED). */}
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <li>
          <Card className="flex h-full flex-col gap-1 p-4">
            <span className="truncate text-xs font-medium uppercase tracking-wide text-ink/50">
              {t("report.billed")}
            </span>
            <span className="text-3xl font-bold leading-none text-neon">
              {clpFmt.format(report.billed)}
            </span>
          </Card>
        </li>
        <li>
          <Card className="flex h-full flex-col gap-1 p-4">
            <span className="truncate text-xs font-medium uppercase tracking-wide text-ink/50">
              {t("report.payers")}
            </span>
            <span className="text-3xl font-bold leading-none text-neon">
              {report.payers}
            </span>
          </Card>
        </li>
        <li className="col-span-2 sm:col-span-1">
          <Card className="flex h-full flex-col gap-1 p-4">
            <span className="truncate text-xs font-medium uppercase tracking-wide text-ink/50">
              {t("report.topPlan")}
            </span>
            <span className="truncate text-xl font-bold leading-tight text-neon">
              {report.topPlan?.name ?? "—"}
            </span>
            {report.topPlan && (
              <span className="text-xs tabular-nums text-ink/50">
                {t("report.topPlanMeta", {
                  count: report.topPlan.count,
                  amount: clpFmt.format(report.topPlan.amount),
                })}
              </span>
            )}
          </Card>
        </li>
      </ul>

      {/* Lista de cobros del período: cada fila navega a su detalle
          (pago de pasarela o comprobante de la cola). */}
      {report.items.length === 0 ? (
        <p role="status" className="text-sm text-ink/50">
          {t("report.empty")}
        </p>
      ) : (
        <Card padded={false}>
          <ul className="flex flex-col divide-y divide-line">
            {report.items.map((r) => (
              <li key={`${r.kind}-${r.id}`}>
                <Link
                  href={
                    r.kind === "CLAIM"
                      ? `/academia/cobros/claim/${r.id}`
                      : `/academia/cobros/pago/${r.id}`
                  }
                  className="flex min-h-11 items-center gap-3 px-4 py-2.5 transition-colors hover:bg-elevated focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {r.personName ?? shortId(r.personId)}
                    </span>
                    <span className="block truncate text-xs text-ink/50">
                      {r.planName ?? t("fieldPlanOther")}
                      {r.method ? ` · ${r.method}` : ""} ·{" "}
                      {dateFmt.format(new Date(r.createdAt))}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm font-semibold tabular-nums">
                    {formatMoney(r.amount, r.currency, locale)}
                  </span>
                  <Badge variant={STATUS_VARIANT[r.status] ?? "muted"}>
                    {statusLabel(r)}
                  </Badge>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {report.total > PAGE_SIZE && (
        <Pager
          page={report.page}
          pageSize={report.pageSize}
          total={report.total}
          onPage={setPage}
        />
      )}
    </div>
  );
}
