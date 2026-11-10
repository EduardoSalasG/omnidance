"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import {
  Badge,
  Button,
  Card,
  ChevronRightIcon,
  RefreshIcon,
  SkeletonList,
  type BadgeVariant,
} from "@/components/ui";
import { AcademyGate } from "@/components/academy/academy-gate";
import { ConsoleHeader } from "@/components/console/console-header";
import { Link } from "@/i18n/navigation";
import { formatMoney, useDateFmt } from "@/lib/intl";
import { periodLabel } from "./format";

/** Filas del GET /academies/:id/statements (spec
 *  academy-byo-collections). */
type StatementRow = {
  id: string;
  period: string;
  periodStart: string;
  periodEnd: string;
  orderCount: number;
  grossClp: number;
  takeNetClp: number;
  takeVatClp: number;
  totalClp: number;
  currency: string;
  status: "PENDING" | "PAID" | string;
  dueAt: string;
  paidAt: string | null;
};

type OpenPreview = {
  period: string;
  orderCount: number;
  grossClp: number;
  takeNetClp: number;
  takeVatClp: number;
  totalClp: number;
};

const STATUS_VARIANT: Record<string, BadgeVariant> = {
  PENDING: "outline",
  PAID: "neon",
};

/**
 * /academia/cobros/liquidaciones - liquidaciones mensuales del take BYO
 * (spec academy-byo-collections): la academia cobra por su pasarela y
 * Omnidance le factura el take mes vencido (neto + IVA). El período en
 * curso se muestra como vista previa "en curso" (aún no emitido); las
 * emitidas listan con su estado de cobro. Detalle en ./[period].
 */
export default function LiquidacionesPage() {
  const t = useTranslations("academyPay");

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 pt-3 pb-6 sm:px-6 lg:max-w-none lg:px-4">
      <ConsoleHeader
        backHref="/academia/cobros"
        backLabel={t("detailBack")}
      />
      <AcademyGate>
        {({ academy }) => (
          <StatementsModule key={academy.id} academyId={academy.id} />
        )}
      </AcademyGate>
    </main>
  );
}

function StatementsModule({ academyId }: { academyId: string }) {
  const locale = useLocale();
  const t = useTranslations("academyPay");
  const tc = useTranslations("common");
  const dateFmt = useDateFmt({ dateStyle: "medium" });

  const [rows, setRows] = useState<StatementRow[] | null>(null);
  const [open, setOpen] = useState<OpenPreview | null>(null);
  const [state, setState] = useState<
    "loading" | "ready" | "forbidden" | "error"
  >("loading");

  const load = useCallback(async () => {
    setState("loading");
    try {
      const res = await apiFetch(`/academies/${academyId}/statements`);
      if (res.status === 401 || res.status === 403 || res.status === 404) {
        setState("forbidden");
        return;
      }
      if (!res.ok) {
        setState("error");
        return;
      }
      const data = (await res.json()) as {
        statements: StatementRow[];
        open: OpenPreview | null;
      };
      setRows(data.statements);
      setOpen(data.open);
      setState("ready");
    } catch {
      setState("error");
    }
  }, [academyId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (state === "loading" && !rows) return <SkeletonList items={3} />;
  if (state === "forbidden") {
    return (
      <Card className="flex flex-col items-center gap-3 py-6 text-center">
        <p className="text-sm text-ink/70">{t("forbidden")}</p>
        <Button href="/academia/cobros" variant="secondary" size="sm">
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
  if (!rows) return null;

  const statusLabel = (s: string) =>
    s === "PAID"
      ? t("statements.statusPaid")
      : t("statements.statusPending");

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-ink/50">
        {t("statements.title")}
      </h2>
      <p className="text-sm text-ink/60">{t("statements.desc")}</p>

      {/* Período en curso: devengado BYO aún no facturado (preview del
          statement que se emitirá al cierre del mes). */}
      {open && (
        <Link
          href={`/academia/cobros/liquidaciones/${open.period}`}
          className="block rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon"
        >
          <Card className="flex flex-col gap-2 p-4 transition-colors hover:border-neon/60">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold capitalize">
                  {periodLabel(open.period, locale)}
                </p>
                <p className="text-xs text-ink/50">
                  {t("statements.openLine", {
                    count: open.orderCount,
                    gross: formatMoney(open.grossClp, "CLP", locale),
                  })}
                </p>
              </div>
              <span className="flex shrink-0 items-center gap-2">
                <Badge variant="muted">{t("statements.openBadge")}</Badge>
                <ChevronRightIcon className="h-4 w-4 shrink-0 text-ink/40" />
              </span>
            </div>
            <p className="text-xs text-ink/50">
              {t("statements.totals", {
                net: formatMoney(open.takeNetClp, "CLP", locale),
                vat: formatMoney(open.takeVatClp, "CLP", locale),
                total: formatMoney(open.totalClp, "CLP", locale),
              })}
            </p>
          </Card>
        </Link>
      )}

      {rows.length === 0 && !open ? (
        <p role="status" className="text-sm text-ink/50">
          {t("statements.empty")}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((s) => (
            <li key={s.id}>
              <Link
                href={`/academia/cobros/liquidaciones/${s.period}`}
                className="block rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon"
              >
                <Card className="flex flex-col gap-2 p-4 transition-colors hover:border-neon/60">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold capitalize">
                        {periodLabel(s.period, locale)}
                      </p>
                      <p className="text-xs text-ink/50">
                        {t("statements.openLine", {
                          count: s.orderCount,
                          gross: formatMoney(s.grossClp, s.currency, locale),
                        })}
                      </p>
                    </div>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="text-sm font-semibold tabular-nums">
                        {formatMoney(s.totalClp, s.currency, locale)}
                      </span>
                      <Badge variant={STATUS_VARIANT[s.status] ?? "muted"}>
                        {statusLabel(s.status)}
                      </Badge>
                      <ChevronRightIcon className="h-4 w-4 shrink-0 text-ink/40" />
                    </span>
                  </div>
                  <p className="text-xs text-ink/50">
                    {s.status === "PAID" && s.paidAt
                      ? t("statements.paidAt", {
                          date: dateFmt.format(new Date(s.paidAt)),
                        })
                      : t("statements.dueAt", {
                          date: dateFmt.format(new Date(s.dueAt)),
                        })}
                  </p>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
