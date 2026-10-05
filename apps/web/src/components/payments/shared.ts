// Tipos y helpers compartidos de las vistas de auditoría de pagos.
// Contrato: GET /payments/mine | /payments/by-event/:id |
// /payments/by-academy/:id - filas proyectadas por withContextNames en
// apps/api/src/payments/infrastructure/webhook.controller.ts.
import type { BadgeVariant } from "@/components/ui";

export type PaymentAuditRow = {
  id: string;
  orderType: string;
  refId: string;
  amount: number;
  fee: number;
  net: number;
  status: string;
  createdAt: string;
  // Verdad monetaria reportada por la pasarela - null en stub/pagos viejos.
  gatewayFeeClp: number | null;
  gatewayReportedAmount: number | null;
  gatewayMedia: string | null;
  gatewayPaidAt: string | null;
  /** Cantidad de eventos del ledger (evidencia tamper-evident). */
  eventCount: number;
  // Contexto de compra resuelto por la API según orderType (los ids
  // permiten linkear el pago a su evento/academia).
  eventId: string | null;
  academyId: string | null;
  eventName: string | null;
  seriesName: string | null;
  academyName: string | null;
  planName: string | null;
};

// GET /payments/:id/events - ledger append-only ordenado por seq.
export type PaymentLedgerEvent = {
  id: string;
  paymentId: string;
  seq: number;
  type: string;
  actor: string;
  payload: unknown;
  createdAt: string;
};

export const PAYMENT_STATUS_VARIANT: Record<string, BadgeVariant> = {
  PENDING: "muted",
  PAID: "neon",
  FAILED: "live",
  REFUNDED: "outline",
};

/** Contexto de compra: evento, serie o "academia · plan" según orderType. */
export function paymentContext(p: PaymentAuditRow): string | null {
  if (p.eventName) return p.eventName;
  if (p.seriesName) return p.seriesName;
  if (p.academyName && p.planName) return `${p.academyName} · ${p.planName}`;
  return p.academyName ?? p.planName;
}

/** Ruta a la ficha del contexto del pago (null = sin destino). */
export function paymentHref(p: PaymentAuditRow): string | null {
  if (p.academyId) return `/academias/${p.academyId}`;
  if (p.eventId) return `/eventos/${p.eventId}`;
  return null;
}

/** Fecha real de cobro: la reportada por la pasarela si existe. */
export function paymentPaidAt(p: PaymentAuditRow): string {
  return p.gatewayPaidAt ?? p.createdAt;
}

export const paymentDateTimeFmt = new Intl.DateTimeFormat("es-CL", {
  dateStyle: "medium",
  timeStyle: "short",
});
