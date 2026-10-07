"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Badge, Button, Card, PriceTag, RefreshIcon } from "@/components/ui";
import { SkeletonList } from "@/components/ui";
import {
  PAYMENT_STATUS_VARIANT,
  paymentDateTimeFmt,
  paymentPaidAt,
  type PaymentAuditRow,
} from "@/components/payments/shared";

type Props = { eventId: string };

/**
 * Ventas del evento (GET /payments/by-event/:eventId - productor dueño
 * del evento o admin; 403/404 → la sección no se muestra). La API solo
 * devuelve órdenes con eventId directo (TICKET) - un SERIES_PASS
 * pertenece a la serie y se liquida por mes en payouts.
 * Tabla real con scroll horizontal en pantallas estrechas (mismo patrón
 * que PassesSection).
 */
export function PaymentsSection({ eventId }: Props) {
  const t = useTranslations("producer");
  const tp = useTranslations("payments");
  const tc = useTranslations("common");

  const [payments, setPayments] = useState<PaymentAuditRow[] | null>(null);
  const [denied, setDenied] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const res = await apiFetch(`/payments/by-event/${eventId}`);
      if (res.status === 403 || res.status === 404) {
        setDenied(true);
        return;
      }
      if (!res.ok) {
        setError(true);
        return;
      }
      setPayments((await res.json()) as PaymentAuditRow[]);
    } catch {
      setError(true);
    }
  }, [eventId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Sin acceso (no-owner / no-admin): la sección no existe para el viewer.
  if (denied) return null;

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-ink/50">
        {t("sections.payments")}
      </h2>

      {payments === null && !error && (
        <SkeletonList items={2} lines={1} />
      )}
      {error && (
        <div className="flex items-center gap-3">
          <p role="alert" className="text-sm text-red-400">
            {tc("error")}
          </p>
          <Button size="sm" variant="ghost" onClick={() => void load()}>
            <RefreshIcon /> {tc("retry")}
          </Button>
        </div>
      )}
      {payments !== null && payments.length === 0 && (
        <p role="status" className="text-sm text-ink/50">
          {tp("byEvent.empty")}
        </p>
      )}
      {payments !== null && payments.length > 0 && (
        <Card
          padded
          className="overflow-x-auto p-0"
          role="region"
          tabIndex={0}
          aria-label={t("sections.payments")}
        >
          <table className="w-full min-w-[36rem] text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs uppercase tracking-wide text-ink/50">
                <th scope="col" className="px-4 py-3 font-medium">
                  {tp("cols.paidAt")}
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  {tp("cols.amount")}
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  {tp("cols.gatewayFee")}
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  {tp("cols.net")}
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  {tp("cols.status")}
                </th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr
                  key={p.id}
                  className="border-b border-line last:border-0"
                >
                  <td className="px-4 py-3 text-ink/70">
                    <span className="block whitespace-nowrap">
                      {paymentDateTimeFmt.format(new Date(paymentPaidAt(p)))}
                    </span>
                    <span className="block text-xs text-ink/40">
                      {p.gatewayMedia ?? p.refId.slice(0, 12)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <PriceTag amount={p.amount} />
                  </td>
                  <td className="px-4 py-3">
                    <PriceTag amount={p.gatewayFeeClp} />
                  </td>
                  <td className="px-4 py-3">
                    <PriceTag amount={p.net} />
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      variant={PAYMENT_STATUS_VARIANT[p.status] ?? "muted"}
                    >
                      {tp.has(`status.${p.status}`)
                        ? tp(`status.${p.status}`)
                        : p.status}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </section>
  );
}
