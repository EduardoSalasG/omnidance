import type {
  BillingWebhookEvent,
  RemoteSubscription,
  RemoteSubscriptionStatus,
  SubscriptionInvoice,
} from "./ports";

/**
 * BillingWebhookEvent (webhook firmado del proveedor - Stripe Billing,
 * spec stripe-subs-webhook) → RemoteSubscription sintético para el
 * reconcile puntual de UNA suscripción local.
 *
 * El evento ES la verdad del cambio puntual - no hay fetch-confirm: la
 * firma verificada por el adaptador ya es la verificación (mismo
 * criterio que SocialPassService.handleBillingEvent). Devuelve null
 * cuando el tipo no produce efecto local (invoice.draft,
 * customer.subscription.created, checkout.session.*, etc.) - el caller
 * igual confirma el match del target y el webhook responde 200.
 *
 * Campos que el evento no informa se toman del `fallback` (la fila
 * local): p.ej. un invoice.payment_failed no trae "próxima fecha de
 * cobro" - se conserva el nextInvoiceAt vigente en vez de limpiarlo.
 */
export function remoteFromBillingEvent(
  ev: BillingWebhookEvent,
  fallback: {
    subscriptionId: string;
    planId?: string;
    nextInvoiceAt?: Date | null;
  },
): RemoteSubscription | null {
  const subscriptionId = ev.subscriptionId ?? fallback.subscriptionId;
  const planId = fallback.planId ?? "";
  const invoice: SubscriptionInvoice | undefined = ev.invoice
    ? {
        id: ev.invoice.id,
        amount: ev.invoice.amount,
        paid: ev.invoice.paid,
        periodStart: ev.invoice.periodStart,
        periodEnd: ev.invoice.periodEnd,
      }
    : undefined;

  // Cobro del período OK → settle de renovación (dedup por
  // lastInvoiceId/refId en el consumer). El periodEnd de la invoice ≈
  // próxima fecha de cobro; si falta se conserva la local.
  if (ev.type === "invoice.paid") {
    return {
      subscriptionId,
      planId,
      status: "ACTIVE",
      morose: false,
      cancelAtPeriodEnd: false,
      nextInvoiceDate:
        ev.invoice?.periodEnd ?? fallback.nextInvoiceAt?.toISOString(),
      invoices: invoice ? [invoice] : [],
    };
  }

  // Cobro rechazado → mora: la invoice impaga es la evidencia que el
  // consumer usa para el dedup de la notificación y del RENEWAL_FAILED
  // (misma clave que el polling: el invoiceId del proveedor).
  if (ev.type === "invoice.payment_failed") {
    return {
      subscriptionId,
      planId,
      status: "ACTIVE",
      morose: true,
      cancelAtPeriodEnd: false,
      nextInvoiceDate: fallback.nextInvoiceAt?.toISOString(),
      invoices: invoice ? [{ ...invoice, paid: false }] : [],
    };
  }

  // Cancel remota efectiva → CANCELED local (con pendiente - reprice o
  // cambio de plan - el consumer materializa el swap igual que el
  // reconcile por polling).
  if (ev.type === "customer.subscription.deleted") {
    return {
      subscriptionId,
      planId,
      status: "CANCELED",
      morose: false,
      cancelAtPeriodEnd: false,
      invoices: [],
    };
  }

  // Update de la sub (ev.raw = objeto subscription de Stripe): cubre
  // el cancel_at_period_end seteado por fuera de la plataforma y el
  // drift de período - mismo sync de estado del reconcile. past_due/
  // unpaid = cobro en reintento → mora vigente.
  if (ev.type === "customer.subscription.updated") {
    const raw = (ev.raw ?? {}) as {
      status?: string;
      cancel_at_period_end?: boolean;
      current_period_end?: number;
      items?: { data?: { current_period_end?: number }[] };
    };
    const rawStatus = raw.status ?? "";
    const status: RemoteSubscriptionStatus =
      rawStatus === "canceled" ? "CANCELED" : "ACTIVE";
    const periodEnd =
      raw.current_period_end ?? raw.items?.data?.[0]?.current_period_end;
    return {
      subscriptionId,
      planId,
      status,
      morose: rawStatus === "past_due" || rawStatus === "unpaid",
      cancelAtPeriodEnd: raw.cancel_at_period_end === true,
      nextInvoiceDate:
        typeof periodEnd === "number"
          ? new Date(periodEnd * 1000).toISOString()
          : fallback.nextInvoiceAt?.toISOString(),
      invoices: [],
    };
  }

  return null;
}
