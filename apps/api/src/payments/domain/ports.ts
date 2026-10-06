// Puerto de pasarela de pago (hexagonal) - el dominio no conoce Flow ni el stub.
export const PAYMENT_GATEWAY = "PAYMENT_GATEWAY";

/**
 * Verdad monetaria normalizada que todo adaptador produce en
 * `gatewayData` (spec gateway-port-normalization): shape plana que el
 * settlement persiste en los campos gateway* del Payment.
 * - fee: costo que la pasarela nos cobró (merchant fee).
 * - amount: monto bruto cobrado al comprador (cruce AMOUNT_MISMATCH).
 * - media: medio de pago ("Visa", "master", "account_money"...).
 * - transferDate: fecha de aprobación/abono reportada.
 * - currency: ISO 4217 reportada (cruce contra Payment.currency).
 * - raw: payload original del proveedor, para evidencia.
 */
export interface NormalizedGatewayData {
  fee?: number;
  amount?: number;
  media?: string;
  transferDate?: string;
  currency?: string;
  raw?: unknown;
  [k: string]: unknown;
}

/**
 * Contexto del request del webhook (spec fintoc-gateway-adapter):
 * Fintoc firma el BODY CRUDO con `Fintoc-Signature` (HMAC-SHA256 de
 * `t.<rawBody>`), así que el adaptador necesita el buffer tal cual
 * llegó (rawBody de NestFactory) y los headers. Los demás adaptadores
 * lo ignoran (Flow re-verifica vía getStatus; MP vía GET /v1/payments).
 */
export interface WebhookContext {
  /** Body crudo UTF-8 tal como llegó - solo presente con rawBody:true. */
  rawBody?: string;
  /** Headers del request (Express IncomingHttpHeaders). */
  headers?: Record<string, string | string[] | undefined>;
}

export interface PaymentGateway {
  /** Identificador persistido en Payment.gateway (STUB | FLOW | MERCADOPAGO | FINTOC). */
  readonly name: string;

  createOrder(p: {
    refId: string;
    amount: number;
    email: string;
    returnUrl: string;
    /** ISO 4217 del Payment - el adaptador rechaza monedas no soportadas. */
    currency?: string;
  }): Promise<{ paymentUrl: string; gatewayRef: string }>;

  verifyWebhook(
    body: unknown,
    ctx?: WebhookContext,
  ): Promise<{
    refId: string;
    status: "PAID" | "FAILED";
    /**
     * Verdad monetaria normalizada (NormalizedGatewayData - Flow la
     * produce desde paymentData, MercadoPago la mapea desde
     * /v1/payments/:id). El settle la persiste en los campos gateway*
     * del Payment cuando hay PAID.
     * Opcional: StubGateway no la produce.
     */
    gatewayData?: unknown;
  }>;

  /**
   * Consulta activa del estado de una orden (polling del checkout).
   * Relevante en sandbox/dev: el webhook de la pasarela no llega a
   * localhost, así que GET /payments/:id puede resolver el estado
   * directamente contra la pasarela por refId (Flow: commerceOrder;
   * MP: external_reference; Fintoc: `ctx.gatewayRef` = el `cs_…`
   * persistido en Payment.gatewayRef - sus sesiones no se buscan por
   * metadata).
   * `gatewayData` = misma verdad monetaria normalizada - el
   * settle la persiste igual sea cual sea el camino de confirmación.
   */
  refreshStatus?(
    refId: string,
    ctx?: { gatewayRef?: string | null },
  ): Promise<{
    status: "PAID" | "FAILED" | "PENDING";
    gatewayData?: unknown;
  }>;
}

// ---- Suscripciones recurrentes (motor nativo de la pasarela) ----

/**
 * Estado remoto de suscripción normalizado (spec
 * subscription-port-generic): el ADAPTADOR traduce los códigos del
 * proveedor - el dominio jamás interpreta números de estado.
 * `UNKNOWN` conserva el código crudo en `rawStatus` (logging) y el
 * consumer lo trata como vigente + warning, misma semántica previa.
 */
export type RemoteSubscriptionStatus =
  | "ACTIVE"
  | "CANCELED"
  | "PENDING"
  | "UNKNOWN";

/**
 * Invoice de suscripción normalizada: `paid` ya viene resuelto por el
 * adaptador según la regla del proveedor (Flow: invoice.status===1 o
 * su pago con status===2); `payment.data` es la verdad monetaria
 * normalizada que el settle persiste en los campos gateway* del
 * Payment de renovación, igual que el gatewayData del webhook.
 */
export interface SubscriptionInvoice {
  id: string | number;
  amount: number;
  paid: boolean;
  periodStart?: string;
  periodEnd?: string;
  payment?: {
    /** id de orden/cobro en el proveedor (Flow: flowOrder). */
    orderRef?: string;
    data?: NormalizedGatewayData;
  };
}

/** Suscripción remota tal como la ve el dominio (normalizada). */
export interface RemoteSubscription {
  subscriptionId: string;
  planId: string;
  status: RemoteSubscriptionStatus;
  /** Código crudo del proveedor - solo logging/diagnóstico. */
  rawStatus?: number | string;
  /** Mora reportada por el proveedor (Flow: morose=1). */
  morose: boolean;
  /** Cancelación programada al fin del período pagado. */
  cancelAtPeriodEnd: boolean;
  nextInvoiceDate?: string;
  invoices?: SubscriptionInvoice[];
}

/** Opciones por llamada: propaga el correlationId de negocio a la auditoría. */
export interface SubscriptionCallOpts {
  correlationId?: string;
}

/**
 * Puerto opcional: las pasarelas con motor de suscripciones lo
 * implementan (Flow hoy; StubGateway en dev - simulación en memoria;
 * MP preapproval / Stripe Billing como slots futuros). Los consumers
 * resuelven el adaptador vía `GatewayRegistry` + param
 * `payments.subscription_gateway` y verifican capability por
 * presencia de métodos (p.ej. `typeof gateway.createSubscription ===
 * "function"`), nunca por `name` ni por el gateway de órdenes.
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

  /** plans/edit - sync cuando staff edita precio/nombre del plan local. */
  syncPlan(
    p: { planId: string; name: string; amount: number },
    opts?: SubscriptionCallOpts,
  ): Promise<void>;

  createCustomer(
    p: { email: string; name: string; externalId: string },
    opts?: SubscriptionCallOpts,
  ): Promise<{ customerId: string }>;

  /** `hasCard` = el customer ya registró medio de pago recurrente. */
  getCustomer(
    customerId: string,
    opts?: SubscriptionCallOpts,
  ): Promise<{ hasCard: boolean }>;

  /** URL de registro de tarjeta (disclaimer del proveedor + retorno con token). */
  registerCustomerCard(
    p: { customerId: string; returnUrl: string },
    opts?: SubscriptionCallOpts,
  ): Promise<{ registerUrl: string }>;

  /** `registered` = el registro de tarjeta terminó con éxito. */
  getRegisterStatus(
    token: string,
    opts?: SubscriptionCallOpts,
  ): Promise<{ registered: boolean; customerId?: string }>;

  createSubscription(
    p: { planId: string; customerId: string; subscriptionStart: string },
    opts?: SubscriptionCallOpts,
  ): Promise<RemoteSubscription>;

  getSubscription(
    subscriptionId: string,
    opts?: SubscriptionCallOpts,
  ): Promise<RemoteSubscription>;

  /**
   * Cancela al fin del período ya pagado. Con `immediate: true` la
   * cancelación es inmediata - solo para compensar una suscripción
   * remota huérfana (creada pero no persistida localmente), nunca
   * para la cancelación del usuario.
   */
  cancelSubscription(
    subscriptionId: string,
    opts?: SubscriptionCallOpts & { immediate?: boolean },
  ): Promise<void>;
}
