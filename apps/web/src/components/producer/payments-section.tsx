"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import {
  Badge,
  Button,
  Card,
  Pager,
  PriceTag,
  RefreshIcon,
} from "@/components/ui";
import { SkeletonList } from "@/components/ui";
import {
  PAYMENT_STATUS_VARIANT,
  paymentDateTimeFmt,
  paymentMedium,
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
  // Vista paginada dentro de la sección: 5 / 10 / "all" con scroll
  // interno del Card - la página no crece con el historial de ventas.
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<5 | 10 | "all">(5);
  // Filtro por estado del pago - se aplica antes de paginar.
  const [status, setStatus] = useState<string>("all");

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

  // Orden de gestión: pendientes primero (lo que exige revisión) de
  // más viejo a más nuevo; el resto de más nuevo a más viejo.
  const sorted = [...(payments ?? [])].sort((a, b) => {
    const ap = a.status === "PENDING" ? 0 : 1;
    const bp = b.status === "PENDING" ? 0 : 1;
    if (ap !== bp) return ap - bp;
    const ta = new Date(paymentPaidAt(a)).getTime();
    const tb = new Date(paymentPaidAt(b)).getTime();
    return ap === 0 ? ta - tb : tb - ta;
  });
  const filtered =
    status === "all" ? sorted : sorted.filter((p) => p.status === status);
  const total = filtered?.length ?? 0;
  // "all" equivale a size=total: un solo slice sin páginas.
  const size = pageSize === "all" ? Math.max(total, 1) : pageSize;
  const pages = Math.max(1, Math.ceil(total / size));
  const safePage = Math.min(page, pages);
  const visible = filtered?.slice((safePage - 1) * size, safePage * size);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink/50">
          {t("sections.payments")}
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-ink/50">
            {tc("filter.status")}
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
              className="h-9 rounded-lg border border-ink/15 bg-canvas px-2 text-sm text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon"
            >
              <option value="all">{tc("filter.all")}</option>
              {Object.keys(PAYMENT_STATUS_VARIANT).map((s) => (
                <option key={s} value={s}>
                  {tp.has(`status.${s}`) ? tp(`status.${s}`) : s}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-xs text-ink/50">
            {tc("pager.perPage")}
            <select
              value={String(pageSize)}
              onChange={(e) => {
                const v = e.target.value;
                setPageSize(v === "all" ? "all" : (Number(v) as 5 | 10));
                setPage(1);
              }}
              className="h-9 rounded-lg border border-ink/15 bg-canvas px-2 text-sm text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon"
            >
              <option value="5">5</option>
              <option value="10">10</option>
              <option value="all">{tc("pager.all")}</option>
            </select>
          </label>
        </div>
      </div>

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
      {visible !== undefined &&
        visible.length === 0 &&
        payments !== null &&
        payments.length > 0 && (
          <p role="status" className="text-sm text-ink/50">
            {tc("filter.noResults")}
          </p>
        )}
      {visible !== undefined && visible.length > 0 && (
        <>
          <Card
            padded
            className="max-h-[22rem] overflow-auto p-0"
            role="region"
            tabIndex={0}
            aria-label={t("sections.payments")}
          >
            <table className="w-full min-w-[36rem] text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs uppercase tracking-wide text-ink/50">
                  {/* thead sticky: al scrollear dentro de la sección el
                      encabezado queda fijo sobre las filas. */}
                  <th
                    scope="col"
                    className="sticky top-0 bg-surface px-4 py-3 font-medium"
                  >
                    {tp("cols.paidAt")}
                  </th>
                  <th
                    scope="col"
                    className="sticky top-0 bg-surface px-4 py-3 font-medium"
                  >
                    {tp("cols.buyer")}
                  </th>
                  <th
                    scope="col"
                    className="sticky top-0 bg-surface px-4 py-3 font-medium"
                  >
                    {tp("cols.medium")}
                  </th>
                  <th
                    scope="col"
                    className="sticky top-0 bg-surface px-4 py-3 font-medium"
                  >
                    {tp("cols.amount")}
                  </th>
                  <th
                    scope="col"
                    className="sticky top-0 bg-surface px-4 py-3 font-medium"
                  >
                    {tp("cols.gatewayFee")}
                  </th>
                  <th
                    scope="col"
                    className="sticky top-0 bg-surface px-4 py-3 font-medium"
                  >
                    {tp("cols.net")}
                  </th>
                  <th
                    scope="col"
                    className="sticky top-0 bg-surface px-4 py-3 font-medium"
                  >
                    {tp("cols.status")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.map((p) => (
                  <tr
                    key={p.id}
                    className="border-b border-line last:border-0"
                  >
                    <td className="px-4 py-3 text-ink/70">
                      <span className="block whitespace-nowrap">
                        {paymentDateTimeFmt.format(new Date(paymentPaidAt(p)))}
                      </span>
                      <span className="block text-xs text-ink/40">
                        {`Nº ${p.refId.slice(0, 12)}`}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="block max-w-40 truncate">
                        {p.personName ?? "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="block max-w-36 truncate whitespace-nowrap">
                        {paymentMedium(p, {
                          academyPresale: tp("methods.academyPresale"),
                          app: tp("methods.app"),
                        })}
                      </span>
                      {p.soldByAcademyName && (
                        <span className="block max-w-36 truncate text-xs text-ink/40">
                          {p.soldByAcademyName}
                        </span>
                      )}
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
          {pageSize !== "all" && (
            <Pager
              page={safePage}
              pageSize={pageSize}
              total={total}
              onPage={setPage}
            />
          )}
          {pageSize === "all" && (
            <span className="text-xs tabular-nums text-ink/50">
              {tc("pager.results", { count: total })}
            </span>
          )}
        </>
      )}
    </section>
  );
}
