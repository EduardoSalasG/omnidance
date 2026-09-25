// Puerto de pasarela de pago (hexagonal) — el dominio no conoce Flow ni el stub.
export const PAYMENT_GATEWAY = "PAYMENT_GATEWAY";

export interface PaymentGateway {
  /** Identificador persistido en Payment.gateway (STUB | FLOW). */
  readonly name: string;

  createOrder(p: {
    refId: string;
    amount: number;
    email: string;
    returnUrl: string;
  }): Promise<{ paymentUrl: string; gatewayRef: string }>;

  verifyWebhook(body: unknown): Promise<{
    refId: string;
    status: "PAID" | "FAILED";
    /**
     * Verdad monetaria reportada por la pasarela (Flow: `paymentData` de
     * payment/getStatus — fee, amount, media, transferDate). El settle la
     * persiste en los campos gateway* del Payment cuando hay PAID.
     * Opcional: StubGateway no la produce.
     */
    gatewayData?: unknown;
  }>;

  /**
   * Consulta activa del estado de una orden (polling del checkout).
   * Relevante en sandbox/dev: el webhook de la pasarela no llega a
   * localhost, así que GET /payments/:id puede resolver el estado
   * directamente contra la pasarela por refId (commerceOrder).
   * `gatewayData` = misma verdad monetaria que verifyWebhook — el
   * settle la persiste igual sea cual sea el camino de confirmación.
   */
  refreshStatus?(refId: string): Promise<{
    status: "PAID" | "FAILED" | "PENDING";
    gatewayData?: unknown;
  }>;
}

// ---- Suscripciones recurrentes (motor nativo de la pasarela) ----

/**
 * Factura de una suscripción Flow (subscription/get → invoices[]).
 *
 * Regla "pagada" — la doc de Flow no la explicita con claridad; esta es
 * la interpretación segura que usa el reconcile (cron + GET /subscriptions):
 *
 *   paid = invoice.status === 1 || invoice.payment?.status === 2
 *
 * Es decir: la invoice marcada cobrada, o su intento de pago asociado
 * con status 2 (pagado — el mismo código que payment/getStatus).
 */
export interface FlowInvoice {
  id: number;
  status: number;
  amount: number;
  period_start?: string;
  period_end?: string;
  payment?: {
    status?: number;
    flowOrder?: number;
    paymentData?: {
      amount?: number;
      fee?: number;
      media?: string;
      date?: string;
      transferDate?: string;
    };
  };
}

export interface FlowSubscription {
  subscriptionId: string;
  planId: string;
  status: number;
  next_invoice_date?: string;
  morose?: number;
  cancel_at_period_end?: number;
  invoices?: FlowInvoice[];
}

/** Regla documentada en FlowInvoice: invoice cobrada o su pago confirmado. */
export function isFlowInvoicePaid(inv: FlowInvoice): boolean {
  return inv.status === 1 || inv.payment?.status === 2;
}

/** Opciones por llamada: propaga el correlationId de negocio a la auditoría. */
export interface SubscriptionCallOpts {
  correlationId?: string;
}

/**
 * Puerto opcional: solo las pasarelas con motor de suscripciones lo
 * implementan (hoy Flow; StubGateway no). Los consumers resuelven el
 * PAYMENT_GATEWAY inyectado y verifican que sea un SubscriptionProvider
 * (p.ej. `gateway.name === "FLOW"` + cast) antes de usarlo.
 */
export interface SubscriptionProvider {
  /** plans/get → si no existe, plans/create (idempotente por planId). */
  ensurePlan(
    p: {
      planId: string;
      name: string;
      amount: number;
      intervalCount: number;
    },
    opts?: SubscriptionCallOpts,
  ): Promise<void>;

  /** plans/edit — sync cuando staff edita precio/nombre del plan local. */
  syncPlan(
    p: { planId: string; name: string; amount: number },
    opts?: SubscriptionCallOpts,
  ): Promise<void>;

  createCustomer(
    p: { email: string; name: string; externalId: string },
    opts?: SubscriptionCallOpts,
  ): Promise<{ customerId: string }>;

  /** `creditCardType` presente = el customer ya registró tarjeta. */
  getCustomer(
    customerId: string,
    opts?: SubscriptionCallOpts,
  ): Promise<{ creditCardType?: string; status?: number }>;

  /** URL de registro de tarjeta (disclaimer de Flow + retorno con token). */
  registerCustomerCard(
    p: { customerId: string; returnUrl: string },
    opts?: SubscriptionCallOpts,
  ): Promise<{ registerUrl: string }>;

  /** Flow devuelve status como STRING ("1"); aquí ya parseado a number. */
  getRegisterStatus(
    token: string,
    opts?: SubscriptionCallOpts,
  ): Promise<{ status: number; customerId?: string }>;

  createSubscription(
    p: { planId: string; customerId: string; subscriptionStart: string },
    opts?: SubscriptionCallOpts,
  ): Promise<FlowSubscription>;

  getSubscription(
    subscriptionId: string,
    opts?: SubscriptionCallOpts,
  ): Promise<FlowSubscription>;

  /**
   * Cancela al fin del período ya pagado (at_period_end=1). Con
   * `immediate: true` → at_period_end=0: cancelación inmediata, usada
   * solo como compensación de una sub Flow huérfana (creada pero no
   * persistida localmente) — nunca para la cancelación del usuario.
   */
  cancelSubscription(
    subscriptionId: string,
    opts?: SubscriptionCallOpts & { immediate?: boolean },
  ): Promise<void>;
}
