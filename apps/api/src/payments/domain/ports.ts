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

/**
 * Evento de billing de suscripción (spec pase-social): Stripe emite
 * `invoice.*` / `customer.subscription.*` / Checkout `mode=subscription`
 * sobre el MISMO endpoint firmado que las órdenes - sin Payment asociado.
 * El adaptador lo normaliza a esta shape y el controller lo rutea al
 * servicio de suscripciones en vez del settle de Payment.
 */
export interface BillingWebhookEvent {
  /** Tipo crudo del evento del proveedor (p.ej. "invoice.paid"). */
  type: string;
  /** metadata.personId del customer/subscription cuando viene. */
  personId?: string;
  customerId?: string;
  subscriptionId?: string;
  /** Invoice normalizada (eventos invoice.*) - montos en unidad mayor. */
  invoice?: {
    id: string;
    amount: number;
    currency: string;
    periodStart?: string;
    periodEnd?: string;
    paid: boolean;
  };
  /**
   * `metadata.socialPass` del objeto (spec multipais-currency): marca
   * que la suscripción/factura pertenece al Pase Social. Sin ella el
   * evento NO es del pase aunque el personId coincida - una membresía
   * o sub de plataforma del mismo actor jamás debe resetear créditos.
   */
  socialPass?: boolean;
  /** Payload crudo del objeto del evento - evidencia. */
  raw?: unknown;
}

/**
 * Resultado de verifyWebhook (spec gateway-port-normalization +
 * pase-social): la variante orden es la de siempre (refId + estado
 * terminal + verdad monetaria); la variante billing cubre eventos de
 * suscripción que no corresponden a ningún Payment - el caller decide
 * por `billing !== undefined`.
 */
export type WebhookVerification =
  | {
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
      billing?: undefined;
    }
  | {
      refId?: undefined;
      status?: undefined;
      gatewayData?: undefined;
      billing: BillingWebhookEvent;
    };

export interface PaymentGateway {
  /** Identificador persistido en Payment.gateway (STUB | FLOW | MERCADOPAGO | FINTOC | STRIPE). */
  readonly name: string;

  /**
   * Monedas ISO 4217 que el adaptador declara soportar en createOrder
   * (spec stripe-gateway-payout-rail - routing por moneda del
   * GatewayRegistry). `undefined` = sin restricción declarada: el
   * adaptador decide por sí mismo en createOrder (p.ej. STRIPE no
   * hardcodea mercados, STUB cubre todo en dev).
   */
  readonly currencies?: string[];

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
  ): Promise<WebhookVerification>;

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
      /**
       * ISO 4217 del plan espejo (spec pase-social): Stripe crea el
       * Price por moneda (lookup_key omni_<planId>_<currency>); Flow es
       * CLP-only y lo ignora. Default del adaptador si ausente.
       */
      currency?: string;
    },
    opts?: SubscriptionCallOpts,
  ): Promise<void>;

  /** plans/edit - sync cuando staff edita precio/nombre del plan local. */
  syncPlan(
    p: { planId: string; name: string; amount: number; currency?: string },
    opts?: SubscriptionCallOpts,
  ): Promise<void>;

  createCustomer(
    p: { email: string; name: string; externalId: string },
    opts?: SubscriptionCallOpts,
  ): Promise<{ customerId: string }>;

  /**
   * Lookup de customer por email (spec pase-social): rescata el
   * customerId remoto cuando la fila local se perdió/nunca se escribió
   * (Stripe: GET /v1/customers?email=). Opcional - Flow no lo expone.
   */
  findCustomerByEmail?(
    email: string,
    opts?: SubscriptionCallOpts,
  ): Promise<{ customerId: string } | null>;

  /** `hasCard` = el customer ya registró medio de pago recurrente. */
  getCustomer(
    customerId: string,
    opts?: SubscriptionCallOpts,
  ): Promise<{ hasCard: boolean }>;

  /**
   * URL de registro de tarjeta (disclaimer del proveedor + retorno con
   * token). Spec pase-social: en Stripe el "registro" ES la Checkout
   * Session mode=subscription (cobra tarjeta + primer período en un
   * paso) - por eso acepta `planId`/`currency` para resolver el Price
   * espejo y `metadata` para atar la sub al person. Flow/Stub ignoran
   * los campos extra.
   */
  registerCustomerCard(
    p: {
      customerId: string;
      returnUrl: string;
      planId?: string;
      currency?: string;
      metadata?: Record<string, string>;
    },
    opts?: SubscriptionCallOpts,
  ): Promise<{ registerUrl: string }>;

  /**
   * `registered` = el registro de tarjeta terminó con éxito.
   * `subscriptionId` (spec pase-social): la Checkout Session de Stripe
   * ya creó la suscripción - su id viene expandido para persistirlo
   * sin una consulta extra. Flow no lo emite.
   */
  getRegisterStatus(
    token: string,
    opts?: SubscriptionCallOpts,
  ): Promise<{
    registered: boolean;
    customerId?: string;
    subscriptionId?: string;
  }>;

  /**
   * Suscripciones del customer (spec pase-social): la vuelta de
   * Checkout no trae el sub id - el confirm por polling lo descubre
   * listando las subs del customer (Stripe: GET /v1/subscriptions?
   * customer=&status=all). Opcional - Flow no lo expone.
   */
  listCustomerSubscriptions?(
    customerId: string,
    opts?: SubscriptionCallOpts,
  ): Promise<RemoteSubscription[]>;

  createSubscription(
    p: {
      planId: string;
      customerId: string;
      subscriptionStart: string;
      /**
       * ISO 4217 del cargo (spec multipais-currency): Stripe resuelve
       * el Price espejo por `omni_<planId>_<currency>` - sin ella un
       * planId compartido entre monedas cobraría en la equivocada.
       * Flow (CLP-only) y Stub la ignoran.
       */
      currency?: string;
    },
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
