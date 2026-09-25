"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Badge, Card, PriceTag, Spinner } from "@/components/ui";
import {
  PAYMENT_STATUS_VARIANT,
  paymentContext,
  paymentDateTimeFmt,
  paymentPaidAt,
  type PaymentAuditRow,
  type PaymentLedgerEvent,
} from "./shared";

type Props = {
  payments: PaymentAuditRow[];
  /**
   * Habilita el detalle expandible del ledger por pago
   * (GET /payments/:id/events — solo dueño del pago o admin; en las
   * consolas by-event/by-academy el caller no es dueño → dejar false).
   */
  withLedger?: boolean;
};

/**
 * Lista mobile-first de pagos (cards): qué se compró, monto, fee Flow,
 * neto y fecha real de cobro (gatewayPaidAt ?? createdAt).
 */
export function PaymentCards({ payments, withLedger = false }: Props) {
  return (
    <ul className="flex flex-col gap-3">
      {payments.map((p) => (
        <PaymentCard key={p.id} payment={p} withLedger={withLedger} />
      ))}
    </ul>
  );
}

function PaymentCard({
  payment: p,
  withLedger,
}: {
  payment: PaymentAuditRow;
  withLedger: boolean;
}) {
  const t = useTranslations("payments");
  const tc = useTranslations("common");

  const [expanded, setExpanded] = useState(false);
  const [events, setEvents] = useState<PaymentLedgerEvent[] | null>(null);
  const [eventsError, setEventsError] = useState(false);

  const title = paymentContext(p) ?? orderTypeLabel(t, p.orderType);

  async function toggleLedger() {
    if (expanded) {
      setExpanded(false);
      return;
    }
    setExpanded(true);
    if (events !== null) return;
    setEventsError(false);
    try {
      const res = await apiFetch(`/payments/${p.id}/events`);
      if (!res.ok) {
        setEventsError(true);
        return;
      }
      setEvents((await res.json()) as PaymentLedgerEvent[]);
    } catch {
      setEventsError(true);
    }
  }

  return (
    <li>
      <Card className="flex flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-3">
          <p className="min-w-0 flex-1 truncate text-sm font-semibold">
            {title}
          </p>
          <Badge variant={PAYMENT_STATUS_VARIANT[p.status] ?? "muted"}>
            {t.has(`status.${p.status}`) ? t(`status.${p.status}`) : p.status}
          </Badge>
        </div>

        <p className="truncate text-xs text-white/50">
          {[
            orderTypeLabel(t, p.orderType),
            p.gatewayMedia,
            paymentDateTimeFmt.format(new Date(paymentPaidAt(p))),
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>

        <dl className="grid grid-cols-3 gap-2">
          <div>
            <dt className="text-xs text-white/50">{t("cols.amount")}</dt>
            <dd>
              <PriceTag amount={p.amount} />
            </dd>
          </div>
          <div>
            <dt className="text-xs text-white/50">{t("cols.gatewayFee")}</dt>
            <dd>
              <PriceTag amount={p.gatewayFeeClp} />
            </dd>
          </div>
          <div>
            <dt className="text-xs text-white/50">{t("cols.net")}</dt>
            <dd>
              <PriceTag amount={p.net} />
            </dd>
          </div>
        </dl>

        {withLedger && (
          <div className="border-t border-night-700 pt-2">
            <button
              type="button"
              onClick={() => void toggleLedger()}
              aria-expanded={expanded}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-white/10 px-3 text-xs font-medium text-white/60 transition-colors hover:border-white/25 hover:text-white"
            >
              <span aria-hidden="true">{expanded ? "▾" : "▸"}</span>
              {t("ledger.toggle", { count: p.eventCount })}
            </button>
            {expanded && (
              <div className="mt-2">
                {events === null && !eventsError && (
                  <Spinner size="sm" className="page-loading" />
                )}
                {eventsError && (
                  <p role="alert" className="text-xs text-red-400">
                    {tc("error")}
                  </p>
                )}
                {events !== null && events.length === 0 && (
                  <p role="status" className="text-xs text-white/50">
                    {t("ledger.empty")}
                  </p>
                )}
                {events !== null && events.length > 0 && (
                  <ol className="flex flex-col gap-1.5">
                    {events.map((e) => (
                      <li
                        key={e.id}
                        className="flex items-baseline gap-2 text-xs"
                      >
                        <span className="shrink-0 tabular-nums text-white/40">
                          #{e.seq}
                        </span>
                        <span className="min-w-0 flex-1 truncate font-medium text-white/80">
                          {e.type}
                        </span>
                        <span className="shrink-0 text-white/40">
                          {e.actor} ·{" "}
                          {paymentDateTimeFmt.format(new Date(e.createdAt))}
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            )}
          </div>
        )}
      </Card>
    </li>
  );
}

function orderTypeLabel(
  t: ReturnType<typeof useTranslations>,
  orderType: string,
): string {
  return t.has(`orderTypes.${orderType}`)
    ? t(`orderTypes.${orderType}`)
    : orderType;
}
