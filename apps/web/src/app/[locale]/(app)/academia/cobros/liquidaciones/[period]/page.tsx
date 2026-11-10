"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import {
  Badge,
  Button,
  Card,
  RefreshIcon,
  SkeletonList,
  type BadgeVariant,
} from "@/components/ui";
import { AcademyGate } from "@/components/academy/academy-gate";
import { ConsoleHeader } from "@/components/console/console-header";
import { formatMoney, useDateFmt } from "@/lib/intl";
import { periodLabel } from "../format";

type Operation = {
  id: string;
  refId: string;
  orderType: string;
  amount: number;
  takeClp: number | null;
  takeRate: number | null;
  currency: string;
  gateway: string | null;
  paidAt: string;
};

type StatementDetail = {
  id: string;
  period: string;
  orderCount: number;
  grossClp: number;
  takeRate: number;
  takeNetClp: number;
  takeVatClp: number;
  totalClp: number;
  currency: string;
  status: string;
  dueAt: string;
  paidAt: string | null;
  operations: Operation[];
};

/** El período en curso aún no tiene statement emitido: la API lo
 *  devuelve como `open` del listado (totales + ops, sin currency). */
type OpenPreview = Omit<
  StatementDetail,
  "id" | "takeRate" | "status" | "dueAt" | "paidAt" | "currency"
>;

const STATUS_VARIANT: Record<string, BadgeVariant> = {
  PENDING: "outline",
  PAID: "neon",
};

/**
 * /academia/cobros/liquidaciones/[period] - estado de cuenta del take
 * BYO (spec academy-byo-collections): totales del statement (bruto
 * cobrado por la pasarela propia, take neto, IVA, total a pagar),
 * vencimiento/pago y la tabla de operaciones del período. El período
 * en curso muestra la vista previa del listado (badge "en curso",
 * sin export - el documento aún no se emite).
 */
export default function LiquidacionDetailPage() {
  const t = useTranslations("academyPay");
  const params = useParams<{ period: string }>();

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 pt-3 pb-6 sm:px-6 lg:max-w-none lg:px-4">
      <ConsoleHeader
        backHref="/academia/cobros/liquidaciones"
        backLabel={t("statements.title")}
      />
      <AcademyGate>
        {({ academy }) => (
          <StatementDetail
            key={`${academy.id}:${params.period}`}
            academyId={academy.id}
            period={params.period}
          />
        )}
      </AcademyGate>
    </main>
  );
}

function StatementDetail({
  academyId,
  period,
}: {
  academyId: string;
  period: string;
}) {
  const locale = useLocale();
  const t = useTranslations("academyPay");
  const tp = useTranslations("payments");
  const tc = useTranslations("common");
  const dateFmt = useDateFmt({ dateStyle: "medium" });
  const dateTimeFmt = useDateFmt({
    dateStyle: "medium",
    timeStyle: "short",
  });

  const [st, setSt] = useState<StatementDetail | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [state, setState] = useState<
    "loading" | "ready" | "forbidden" | "error"
  >("loading");

  const load = useCallback(async () => {
    setState("loading");
    setIsOpen(false);
    try {
      const res = await apiFetch(
        `/academies/${academyId}/statements/${period}`,
      );
      if (res.status === 401 || res.status === 403) {
        setState("forbidden");
        return;
      }
      if (res.status === 404) {
        // Período sin statement emitido: si es el mes en curso, la
        // vista previa `open` del listado es la verdad del devengado.
        const list = await apiFetch(`/academies/${academyId}/statements`);
        if (list.ok) {
          const data = (await list.json()) as {
            open: (OpenPreview & { operations: Operation[] }) | null;
          };
          if (data.open && data.open.period === period) {
            setSt({
              id: "",
              takeRate: 0,
              status: "OPEN",
              dueAt: "",
              paidAt: null,
              currency: "CLP",
              ...data.open,
            });
            setIsOpen(true);
            setState("ready");
            return;
          }
        }
        setState("forbidden");
        return;
      }
      if (!res.ok) {
        setState("error");
        return;
      }
      setSt((await res.json()) as StatementDetail);
      setState("ready");
    } catch {
      setState("error");
    }
  }, [academyId, period]);

  useEffect(() => {
    void load();
  }, [load]);

  const orderTypeLabel = (type: string) => {
    // Payment.orderType PRIVATE ↔ el label del catálogo PRIVATE_LESSON.
    const key = type === "PRIVATE" ? "PRIVATE_LESSON" : type;
    return tp.has(`orderTypes.${key}`) ? tp(`orderTypes.${key}`) : type;
  };

  if (state === "loading" && !st) return <SkeletonList items={3} />;
  if (state === "forbidden") {
    return (
      <Card className="flex flex-col items-center gap-3 py-6 text-center">
        <p className="text-sm text-ink/70">{t("forbidden")}</p>
        <Button
          href="/academia/cobros/liquidaciones"
          variant="secondary"
          size="sm"
        >
          {t("statements.title")}
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
  if (!st) return null;

  const lang = locale.startsWith("en") ? "en" : "es";

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 className="text-lg font-semibold capitalize">
          {periodLabel(st.period, locale)}
        </h2>
        <Badge
          variant={
            isOpen ? "muted" : (STATUS_VARIANT[st.status] ?? "muted")
          }
        >
          {isOpen
            ? t("statements.openBadge")
            : st.status === "PAID"
              ? t("statements.statusPaid")
              : t("statements.statusPending")}
        </Badge>
      </div>
      {isOpen && (
        <p className="text-sm text-ink/60">{t("statements.openDesc")}</p>
      )}

      <Card className="flex flex-col gap-3 p-4">
        <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-ink/50">
              {t("statements.fieldGross")}
            </dt>
            <dd className="font-medium tabular-nums">
              {formatMoney(st.grossClp, st.currency, locale)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-ink/50">
              {t("statements.fieldOrders")}
            </dt>
            <dd className="font-medium tabular-nums">{st.orderCount}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink/50">
              {t("statements.fieldTakeNet")}
            </dt>
            <dd className="font-medium tabular-nums">
              {formatMoney(st.takeNetClp, st.currency, locale)}
              {st.takeRate > 0 && (
                <span className="text-xs text-ink/50">
                  {" "}
                  · {st.takeRate}%
                </span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-ink/50">
              {t("statements.fieldVat")}
            </dt>
            <dd className="font-medium tabular-nums">
              {formatMoney(st.takeVatClp, st.currency, locale)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-ink/50">
              {t("statements.fieldTotal")}
            </dt>
            <dd className="font-semibold tabular-nums text-neon">
              {formatMoney(st.totalClp, st.currency, locale)}
            </dd>
          </div>
          {!isOpen && (
            <div>
              <dt className="text-xs text-ink/50">
                {st.status === "PAID"
                  ? t("statements.fieldPaidAt")
                  : t("statements.fieldDueAt")}
              </dt>
              <dd className="font-medium tabular-nums">
                {st.status === "PAID" && st.paidAt
                  ? dateFmt.format(new Date(st.paidAt))
                  : st.dueAt
                    ? dateFmt.format(new Date(st.dueAt))
                    : "—"}
              </dd>
            </div>
          )}
        </dl>
      </Card>

      {/* Export del documento emitido (spec academy-byo-collections):
          <a download> preserva la cookie vía el proxy /api; filename y
          contenido localizados por `lang`. El preview "en curso" aún
          no es documento - sin export. */}
      {!isOpen && (
        <div className="flex items-center justify-end gap-2">
          <span className="text-xs text-ink/50">
            {t("statements.export")}
          </span>
          {(["csv", "pdf"] as const).map((f) => (
            <a
              key={f}
              href={`/api/academies/${academyId}/statements/${st.period}.${f}?lang=${lang}`}
              download
              className={`inline-flex min-h-11 min-w-16 items-center justify-center rounded-xl border px-4 text-xs font-bold uppercase tracking-wide transition-colors ${
                f === "csv"
                  ? "border-line bg-surface text-ink hover:border-neon/60"
                  : "border-neon/40 bg-neon/10 text-neon hover:border-neon/70"
              }`}
            >
              {f}
            </a>
          ))}
        </div>
      )}

      {/* Operaciones BYO del período: cada orden PAID por la pasarela
          propia con su take devengado. */}
      {st.operations.length === 0 ? (
        <p role="status" className="text-sm text-ink/50">
          {t("statements.emptyOps")}
        </p>
      ) : (
        <Card padded={false}>
          <ul className="flex flex-col divide-y divide-line">
            {st.operations.map((op) => (
              <li
                key={op.id}
                className="flex items-center justify-between gap-3 px-5 py-4"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {orderTypeLabel(op.orderType)}
                    {op.gateway && (
                      <span className="text-xs text-ink/50">
                        {" "}
                        · {op.gateway}
                      </span>
                    )}
                  </p>
                  <p className="text-xs tabular-nums text-ink/50">
                    {dateTimeFmt.format(new Date(op.paidAt))}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold tabular-nums">
                    {formatMoney(op.amount, op.currency, locale)}
                  </p>
                  <p className="text-xs tabular-nums text-ink/50">
                    {t("statements.opTake", {
                      take: formatMoney(
                        op.takeClp ?? 0,
                        op.currency,
                        locale,
                      ),
                    })}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </section>
  );
}
