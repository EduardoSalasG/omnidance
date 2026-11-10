import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type {
  PaymentGateway,
  RemoteSubscription,
  RemoteSubscriptionStatus,
  SubscriptionCallOpts,
  SubscriptionInvoice,
  WebhookVerification,
} from "../domain/ports";
import {
  sanitizeGatewayPayload,
  type GatewayTxEntry,
} from "./gateway-transactions.service";

// MercadoPago (https://www.mercadopago.cl/developers): REST API con
// Bearer access token. Checkout = "preference" (init_point es la URL
// de pago; external_reference = nuestro refId); confirmación por
// webhook (notificación {type:"payment", data:{id}} - o IPN legacy
// {topic:"payment", id}) → GET /v1/payments/:id → estado terminal.
// La fetch de confirmación ES la verificación: una notificación
// falsificada solo dispara una consulta que devuelve el estado real.
//
// gatewayData se normaliza a la shape plana del puerto
// (NormalizedGatewayData): {fee, amount, media, transferDate,
// currency, raw} - el mismo contrato que produce Flow desde
// paymentData, así el settle persiste los campos gateway* sin
// distinguir proveedor.
//
// Credenciales: MERCADOPAGO_ACCESS_TOKEN (test- para sandbox,
// APP_USR- prod). El adapter no se registra sin token.

/** Monedas que el adaptador acepta en createOrder (ISO 4217). */
export const SUPPORTED_CURRENCIES = new Set([
  "CLP",
  "ARS",
  "BRL",
  "MXN",
  "COP",
  "PEN",
  "UYU",
  "USD",
  "EUR",
]);

interface MpPayment {
  id?: number;
  status?: string;
  external_reference?: string | null;
  currency_id?: string;
  transaction_amount?: number;
  transaction_details?: {
    total_paid_amount?: number;
    net_received_amount?: number;
  };
  fee_details?: { type?: string; amount?: number }[];
  payment_method_id?: string;
  payment_type_id?: string;
  date_approved?: string;
}

// Suscripciones (spec mercadopago-subscriptions): el recurso remoto es
// el `preapproval` (contrato without-plan pending - cada uno lleva su
// propio auto_recurring) y la "invoice" del ciclo es el
// `authorized_payment` que MP emite por período.
interface MpPreapproval {
  id?: string | number;
  status?: string;
  reason?: string;
  external_reference?: string | null;
  payer_id?: string | number;
  payer_email?: string;
  init_point?: string;
  next_payment_date?: string;
  back_url?: string;
  auto_recurring?: {
    frequency?: number;
    frequency_type?: string;
    transaction_amount?: number;
    currency_id?: string;
    start_date?: string;
    end_date?: string;
  };
}

interface MpAuthorizedPayment {
  id?: string | number;
  preapproval_id?: string | number;
  status?: string;
  transaction_amount?: number;
  currency_id?: string;
  date_created?: string;
  payment_id?: string | number;
}

interface MpCustomer {
  id?: string | number;
  email?: string;
}

/** Status de authorized_payment que MP considera cobrado. */
const PREAPPROVAL_PAID = new Set(["processed", "approved"]);

/** Status de authorized_payment en fallo terminal (mora). */
const PREAPPROVAL_FAILED = new Set(["rejected", "cancelled"]);

function normalizeAuthorizedPayment(
  p: MpAuthorizedPayment,
): SubscriptionInvoice {
  return {
    id: p.id != null ? String(p.id) : "",
    amount: p.transaction_amount ?? 0,
    paid: p.status != null && PREAPPROVAL_PAID.has(p.status),
    periodStart: p.date_created,
    payment: {
      orderRef: p.payment_id != null ? String(p.payment_id) : undefined,
      data: {
        amount: p.transaction_amount,
        currency: p.currency_id,
        transferDate: p.date_created,
        raw: p,
      },
    },
  };
}

/**
 * preapproval → RemoteSubscription: authorized = vigente, cancelled =
 * terminal, pending = aún no autorizado (nunca ACTIVE a ciegas) y
 * paused/cualquier otro → UNKNOWN con rawStatus (vigente + warning,
 * misma política del port). `planId` lleva el external_reference (id
 * local de la sub) como evidencia del vínculo.
 */
function normalizePreapproval(
  pre: MpPreapproval,
  payments: MpAuthorizedPayment[],
): RemoteSubscription {
  const rawStatus = pre.status ?? "";
  const status: RemoteSubscriptionStatus =
    rawStatus === "authorized"
      ? "ACTIVE"
      : rawStatus === "cancelled"
        ? "CANCELED"
        : rawStatus === "pending"
          ? "PENDING"
          : "UNKNOWN";
  return {
    subscriptionId: pre.id != null ? String(pre.id) : "",
    planId: pre.external_reference ?? "",
    status,
    rawStatus: rawStatus || undefined,
    // Una cuota rechazada = mora (misma semántica que Flow morose=1);
    // la impaga queda en invoices[] para el aviso renewal_failed.
    morose: payments.some(
      (p) => p.status != null && PREAPPROVAL_FAILED.has(p.status),
    ),
    // MP cancel corta los cargos futuros de una - la cortesía hasta el
    // fin del período es semántica local (CANCEL_PENDING), no remota.
    cancelAtPeriodEnd: false,
    nextInvoiceDate: pre.next_payment_date,
    invoices: payments.map(normalizeAuthorizedPayment),
  };
}

/** Estados terminales negativos (MP no cobra de nuevo sobre ellos). */
const FAILED_STATUSES = new Set([
  "rejected",
  "cancelled",
  "refunded",
  "charged_back",
]);

/**
 * payment → NormalizedGatewayData. fee = total_paid - net_received
 * (lo que MP se quedó) - fee_details existe pero a veces llega vacío;
 * el delta siempre está.
 */
function normalizeGatewayData(p: MpPayment): Record<string, unknown> {
  const paid = p.transaction_details?.total_paid_amount;
  const net = p.transaction_details?.net_received_amount;
  const fee =
    paid != null && net != null ? Math.round(paid - net) : undefined;
  return {
    fee,
    amount: paid ?? p.transaction_amount,
    media: p.payment_method_id ?? p.payment_type_id,
    transferDate: p.date_approved,
    currency: p.currency_id,
    raw: p,
  };
}

@Injectable()
export class MercadoPagoGateway implements PaymentGateway {
  readonly name = "MERCADOPAGO";
  // Declaración para el routing por moneda del registry (spec
  // stripe-gateway-payout-rail): solo LatAm; USD/EUR las toma STRIPE
  // (rail global) cuando ambos conviven; `createOrder` sigue aceptando
  // USD/EUR vía SUPPORTED_CURRENCIES para cuentas propias del productor.
  readonly currencies = ["CLP", "ARS", "BRL", "MXN", "COP", "PEN", "UYU"];

  constructor(
    private readonly accessToken: string,
    private readonly baseUrl = "https://api.mercadopago.com",
    // notification_url del preference: `${API_URL}/api/payments/webhook/MERCADOPAGO`.
    private readonly notificationUrl = "",
    private readonly onTx?: (e: GatewayTxEntry) => Promise<void>,
    // back_url del preapproval (retorno GET del pagador):
    // `${API_URL}/api/payments/mp/subscription-return?account=<id>` -
    // lo arma buildAdapter por cuenta (spec mercadopago-subscriptions).
    private readonly subscriptionReturnUrl = "",
  ) {}

  async createOrder(p: {
    refId: string;
    amount: number;
    email: string;
    returnUrl: string;
    currency?: string;
  }): Promise<{ paymentUrl: string; gatewayRef: string }> {
    const currency = (p.currency ?? "CLP").toUpperCase();
    if (!SUPPORTED_CURRENCIES.has(currency)) {
      throw new Error(
        `mercadopago createOrder: moneda no soportada ${currency}`,
      );
    }
    const data = await this.call<{ id?: string; init_point?: string }>(
      "checkout/preferences",
      {
        items: [
          {
            title: p.refId.startsWith("mem_")
              ? "Plan Omnidance"
              : p.refId.startsWith("sp_")
                ? "Pase de serie Omnidance"
                : "Ticket Omnidance",
            quantity: 1,
            unit_price: p.amount,
            currency_id: currency,
          },
        ],
        payer: { email: p.email },
        external_reference: p.refId,
        notification_url: this.notificationUrl || undefined,
        back_urls: {
          success: p.returnUrl,
          failure: p.returnUrl,
          pending: p.returnUrl,
        },
        auto_return: "approved",
      },
      { method: "POST" },
    );
    if (!data.init_point) {
      throw new Error("mercadopago createOrder: respuesta sin init_point");
    }
    return { paymentUrl: data.init_point, gatewayRef: String(data.id) };
  }

  /**
   * Notificación MP (webhooks nuevo formato o IPN legacy) → fetch del
   * recurso → estado normalizado. Tres topics:
   * - payment → GET /v1/payments/:id → orden (refId + terminal).
   * - subscription_authorized_payment → GET /authorized_payments/:id →
   *   billing invoice.paid/payment_failed con subscriptionId =
   *   preapproval_id (spec mercadopago-subscriptions).
   * - subscription_preapproval → GET /preapproval/:id → billing
   *   customer.subscription.updated (reconcile puntual de la sub).
   * La fetch ES la verificación: una notificación falsificada solo
   * dispara una consulta que devuelve el estado real.
   */
  async verifyWebhook(body: unknown): Promise<WebhookVerification> {
    const n = extractNotification(body);
    if (n == null) {
      throw new Error("webhook mercadopago inválido");
    }
    if (n.kind === "authorized_payment") {
      const ap = await this.call<MpAuthorizedPayment>(
        `authorized_payments/${encodeURIComponent(n.id)}`,
        undefined,
        { method: "GET" },
      );
      const paid = ap.status != null && PREAPPROVAL_PAID.has(ap.status);
      return {
        billing: {
          type: paid ? "invoice.paid" : "invoice.payment_failed",
          subscriptionId:
            ap.preapproval_id != null ? String(ap.preapproval_id) : n.id,
          invoice: {
            id: ap.id != null ? String(ap.id) : n.id,
            amount: ap.transaction_amount ?? 0,
            currency: ap.currency_id ?? "CLP",
            periodStart: ap.date_created,
            paid,
          },
          raw: ap,
        },
      };
    }
    if (n.kind === "preapproval") {
      const pre = await this.call<MpPreapproval>(
        `preapproval/${encodeURIComponent(n.id)}`,
        undefined,
        { method: "GET" },
      );
      // Se normaliza al vocabulary que remoteFromBillingEvent entiende
      // (customer.subscription.updated): status traducido y
      // current_period_end desde next_payment_date - el consumer hace
      // el sync de estado igual que con cualquier provider.
      const status =
        pre.status === "cancelled"
          ? "canceled"
          : pre.status === "paused"
            ? "past_due"
            : pre.status === "authorized"
              ? "active"
              : "unpaid";
      const nextMs = pre.next_payment_date
        ? Date.parse(pre.next_payment_date)
        : NaN;
      return {
        billing: {
          type: "customer.subscription.updated",
          subscriptionId: pre.id != null ? String(pre.id) : n.id,
          customerId:
            pre.payer_id != null ? String(pre.payer_id) : undefined,
          raw: {
            ...pre,
            status,
            cancel_at_period_end: false,
            current_period_end: Number.isFinite(nextMs)
              ? Math.floor(nextMs / 1000)
              : undefined,
          },
        },
      };
    }
    const p = await this.call<MpPayment>(`v1/payments/${n.id}`, {
      method: "GET",
    });
    if (!p.external_reference) {
      throw new Error("mercadopago payment sin external_reference");
    }
    if (p.status === "approved") {
      return {
        refId: p.external_reference,
        status: "PAID",
        gatewayData: normalizeGatewayData(p),
      };
    }
    if (p.status && FAILED_STATUSES.has(p.status)) {
      return {
        refId: p.external_reference,
        status: "FAILED",
        gatewayData: normalizeGatewayData(p),
      };
    }
    throw new Error(
      `mercadopago payment ${n.id}: estado no terminal ${p.status}`,
    );
  }

  /**
   * Consulta activa por external_reference (= nuestro refId) - polling
   * del checkout cuando el webhook no alcanza localhost (misma función
   * que Flow.refreshStatus por commerceOrder). MP devuelve los pagos
   * más recientes primero; se toma el último estado.
   */
  async refreshStatus(refId: string): Promise<{
    status: "PAID" | "FAILED" | "PENDING";
    gatewayData?: unknown;
  }> {
    const data = await this.call<{ results?: MpPayment[] }>(
      `v1/payments/search?external_reference=${encodeURIComponent(refId)}`,
      { method: "GET" },
    );
    const p = data.results?.[0];
    if (!p) return { status: "PENDING" };
    const gatewayData = normalizeGatewayData(p);
    if (p.status === "approved") return { status: "PAID", gatewayData };
    if (p.status && FAILED_STATUSES.has(p.status)) {
      return { status: "FAILED", gatewayData };
    }
    return { status: "PENDING", gatewayData };
  }

  // ---------- Suscripciones (SubscriptionProvider) ----------
  // Contrato MP "without-plan pending" (spec mercadopago-subscriptions):
  // no hay plan remoto - cada preapproval lleva su auto_recurring propio
  // (monto + frecuencia en meses) y la tarjeta del pagador se autoriza
  // en el init_point hosted de MP. `external_reference` = id local de
  // la sub: es la dedup determinística de TODO el ciclo (el return, el
  // createSubscription y el sweep buscan por él).
  //
  // Deliberadamente SIN syncPlan ni collect (la capability es por
  // presencia de método): un syncPlan no-op marcaría la cuenta como
  // "sincronizada" en syncMirrorPlan y actualizaría planChargeClp
  // local dejando el cargo remoto viejo sin drift visible - el reprice
  // real va por repriceSubscription (PUT auto_recurring por sub). Y
  // collect pide customerId pero MP cobra por preapproval - no hay
  // lookup inequívoco customer→sub.

  /** Sin plan remoto (contrato without-plan): el espejo no existe. */
  async ensurePlan(
    _p: {
      planId: string;
      name: string;
      amount: number;
      intervalCount: number;
      currency?: string;
    },
    _opts?: SubscriptionCallOpts,
  ): Promise<void> {}

  /** /v1/customers/search?email → si no existe, POST /v1/customers. */
  async createCustomer(
    p: { email: string; name: string; externalId: string },
    opts?: SubscriptionCallOpts,
  ): Promise<{ customerId: string }> {
    const found = await this.findCustomerByEmail(p.email, opts);
    if (found) return found;
    const data = await this.call<MpCustomer>(
      "v1/customers",
      { email: p.email, first_name: p.name || undefined },
      { method: "POST", correlationId: opts?.correlationId },
    );
    if (data.id == null) {
      throw new Error("mercadopago v1/customers: respuesta sin id");
    }
    return { customerId: String(data.id) };
  }

  async findCustomerByEmail(
    email: string,
    opts?: SubscriptionCallOpts,
  ): Promise<{ customerId: string } | null> {
    const data = await this.call<{ results?: MpCustomer[] }>(
      `v1/customers/search?email=${encodeURIComponent(email)}`,
      undefined,
      { method: "GET", correlationId: opts?.correlationId },
    );
    const id = data.results?.[0]?.id;
    return id != null ? { customerId: String(id) } : null;
  }

  /**
   * Siempre false: cada preapproval exige su propia autorización hosted
   * - MP no reusa tarjeta entre subs sin `card_token_id` (contrato
   * authorized, fuera de alcance). Sin fetch: no hay nada que mirar.
   */
  async getCustomer(
    _customerId: string,
    _opts?: SubscriptionCallOpts,
  ): Promise<{ hasCard: boolean }> {
    return { hasCard: false };
  }

  /**
   * "Registro de tarjeta" = creación del preapproval pending (spec
   * mercadopago-subscriptions): `external_reference` = metadata.subId
   * y registerUrl = init_point de MP. Dedup por external_reference:
   * un pending vivo reusa su init_point; uno ya authorized devuelve
   * el back_url (cae directo al return que activa la sub local).
   */
  async registerCustomerCard(
    p: {
      customerId: string;
      returnUrl: string;
      planId?: string;
      currency?: string;
      metadata?: Record<string, string>;
    },
    opts?: SubscriptionCallOpts,
  ): Promise<{ registerUrl: string }> {
    const subId = p.metadata?.subId;
    if (!subId) {
      throw new Error(
        "mercadopago registerCustomerCard: metadata.subId requerido (external_reference del preapproval)",
      );
    }
    const backUrl = this.subscriptionBackUrl(subId);
    const existing = await this.searchPreapprovalByRef(subId, opts);
    const authorized = existing.find((x) => x.status === "authorized");
    if (authorized) return { registerUrl: backUrl };
    const pending = existing.find((x) => x.status === "pending");
    if (pending?.init_point) return { registerUrl: pending.init_point };

    const amount = Number(p.metadata?.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error(
        "mercadopago registerCustomerCard: metadata.amount requerido",
      );
    }
    const frequency = Number(p.metadata?.intervalCount ?? "1");
    const currency = (p.currency ?? "CLP").toUpperCase();
    const customer = await this.call<MpCustomer>(
      `v1/customers/${encodeURIComponent(p.customerId)}`,
      undefined,
      { method: "GET", correlationId: opts?.correlationId },
    );
    if (!customer.email) {
      throw new Error(
        `mercadopago registerCustomerCard: customer ${p.customerId} sin email`,
      );
    }
    const data = await this.call<MpPreapproval>(
      "preapproval",
      {
        reason: p.metadata?.reason || "Suscripción Omnidance",
        external_reference: subId,
        payer_email: customer.email,
        auto_recurring: {
          frequency:
            Number.isFinite(frequency) && frequency > 0 ? frequency : 1,
          frequency_type: "months",
          transaction_amount: amount,
          currency_id: currency,
          // Sin start_date (MP la autocompleta al crear - mandarla
          // "ahora" la rechaza como past date) ni end_date: sub
          // indefinida, la corta el cancel local.
        },
        back_url: backUrl,
        status: "pending",
      },
      {
        method: "POST",
        correlationId: opts?.correlationId,
        // Se audita con el nombre genérico del puerto: el orphan sweep
        // de SubscriptionsService barre los "subscription/create" -
        // una sub remota sin fila local viva se cancela igual que en
        // cualquier provider (spec mercadopago-subscriptions).
        auditAs: "subscription/create",
      },
    );
    if (!data.init_point) {
      throw new Error("mercadopago preapproval: respuesta sin init_point");
    }
    return { registerUrl: data.init_point };
  }

  /**
   * token = external_reference del back_url (id local de la sub - el
   * retorno GET no trae nada de MP, la referencia viaja horneada en la
   * URL). `registered` solo cuando el preapproval quedó authorized.
   */
  async getRegisterStatus(
    token: string,
    opts?: SubscriptionCallOpts,
  ): Promise<{
    registered: boolean;
    customerId?: string;
    subscriptionId?: string;
  }> {
    const list = await this.searchPreapprovalByRef(token, opts);
    const hit =
      list.find((x) => x.status === "authorized") ?? list[0];
    if (!hit) return { registered: false };
    return {
      registered: hit.status === "authorized",
      customerId: hit.payer_id != null ? String(hit.payer_id) : undefined,
      subscriptionId: hit.id != null ? String(hit.id) : undefined,
    };
  }

  /**
   * Lookup del preapproval - el contrato pending NUNCA crea uno acá:
   * primero por `externalRef` (external_reference = id local, dedup
   * determinística), fallback payer_email del customer. Sin match →
   * error explícito.
   */
  async createSubscription(
    p: {
      planId: string;
      customerId: string;
      subscriptionStart: string;
      currency?: string;
      externalRef?: string;
    },
    opts?: SubscriptionCallOpts,
  ): Promise<RemoteSubscription> {
    let list: MpPreapproval[] = [];
    if (p.externalRef) {
      list = await this.searchPreapprovalByRef(p.externalRef, opts);
    }
    if (!list.length) {
      const email = await this.customerEmail(p.customerId, opts);
      if (email) {
        list = await this.searchPreapprovals(
          `payer_email=${encodeURIComponent(email)}`,
          opts,
        );
      }
    }
    const hit = list.find((x) => x.status !== "cancelled") ?? list[0];
    if (!hit?.id) {
      throw new Error(
        `mercadopago createSubscription: sin preapproval${p.externalRef ? ` para ${p.externalRef}` : ""} - lo crea registerCustomerCard`,
      );
    }
    const payments = await this.authorizedPayments(String(hit.id), opts);
    return normalizePreapproval(hit, payments);
  }

  /**
   * GET /preapproval/:id + authorized_payments del ciclo - fuente de
   * verdad del reconcile (status, próxima cuota e invoices).
   */
  async getSubscription(
    subscriptionId: string,
    opts?: SubscriptionCallOpts,
  ): Promise<RemoteSubscription> {
    let pre: MpPreapproval;
    try {
      pre = await this.call<MpPreapproval>(
        `preapproval/${encodeURIComponent(subscriptionId)}`,
        undefined,
        { method: "GET", correlationId: opts?.correlationId },
      );
    } catch (e) {
      // Id inexistente → CANCELED: la fila local converge a CANCELED
      // en el próximo reconcile (misma semántica que StubGateway).
      if (e instanceof Error && /HTTP 404/.test(e.message)) {
        return {
          subscriptionId,
          planId: "",
          status: "CANCELED",
          morose: false,
          cancelAtPeriodEnd: false,
          invoices: [],
        };
      }
      throw e;
    }
    const payments = await this.authorizedPayments(subscriptionId, opts);
    return normalizePreapproval(pre, payments);
  }

  /**
   * Preapprovals del customer por payer_email (sweep/diagnóstico -
   * misma función que listCustomerSubscriptions de Stripe).
   */
  async listCustomerSubscriptions(
    customerId: string,
    opts?: SubscriptionCallOpts,
  ): Promise<RemoteSubscription[]> {
    const email = await this.customerEmail(customerId, opts);
    if (!email) return [];
    const list = await this.searchPreapprovals(
      `payer_email=${encodeURIComponent(email)}`,
      opts,
    );
    return list.map((pre) => normalizePreapproval(pre, []));
  }

  /**
   * PUT {status:"cancelled"}: MP corta los cargos futuros de una - la
   * cortesía hasta fin del período es semántica local (la sub queda
   * CANCEL_PENDING en el engine). `immediate` no cambia la llamada.
   */
  async cancelSubscription(
    subscriptionId: string,
    opts?: SubscriptionCallOpts & { immediate?: boolean },
  ): Promise<void> {
    await this.call<unknown>(
      `preapproval/${encodeURIComponent(subscriptionId)}`,
      { status: "cancelled" },
      { method: "PUT", correlationId: opts?.correlationId },
    );
  }

  /**
   * Reprice in-place (spec mercadopago-subscriptions): PUT
   * auto_recurring.transaction_amount sobre el preapproval vivo - la
   * alternativa (cancel+recreate) no existe en MP porque una sub
   * cancelada jamás se reactiva.
   */
  async repriceSubscription(
    subscriptionId: string,
    p: { amount: number; currency?: string },
    opts?: SubscriptionCallOpts,
  ): Promise<void> {
    await this.call<unknown>(
      `preapproval/${encodeURIComponent(subscriptionId)}`,
      {
        auto_recurring: {
          transaction_amount: p.amount,
          currency_id: (p.currency ?? "CLP").toUpperCase(),
        },
      },
      { method: "PUT", correlationId: opts?.correlationId },
    );
  }

  /** back_url del preapproval con el subId horneado en la query. */
  private subscriptionBackUrl(subId: string): string {
    if (!this.subscriptionReturnUrl) {
      throw new Error(
        "MercadoPagoGateway: subscriptionReturnUrl no configurada - el back_url del preapproval dejaría al pagador sin retorno",
      );
    }
    const sep = this.subscriptionReturnUrl.includes("?") ? "&" : "?";
    return `${this.subscriptionReturnUrl}${sep}sub=${encodeURIComponent(subId)}`;
  }

  private async customerEmail(
    customerId: string,
    opts?: SubscriptionCallOpts,
  ): Promise<string | null> {
    const c = await this.call<MpCustomer>(
      `v1/customers/${encodeURIComponent(customerId)}`,
      undefined,
      { method: "GET", correlationId: opts?.correlationId },
    );
    return c.email ?? null;
  }

  /**
   * Búsqueda por external_reference: MP acepta el param en
   * /preapproval/search pero NO filtra por él (devuelve los
   * preapprovals de la cuenta igual) - hay que filtrar del lado
   * cliente o la dedup agarraría la remota de OTRA sub.
   */
  private async searchPreapprovalByRef(
    ref: string,
    opts?: SubscriptionCallOpts,
  ): Promise<MpPreapproval[]> {
    const list = await this.searchPreapprovals(
      `external_reference=${encodeURIComponent(ref)}`,
      opts,
    );
    return list.filter((x) => x.external_reference === ref);
  }

  private async searchPreapprovals(
    query: string,
    opts?: SubscriptionCallOpts,
  ): Promise<MpPreapproval[]> {
    const data = await this.call<{ results?: MpPreapproval[] }>(
      `preapproval/search?${query}`,
      undefined,
      { method: "GET", correlationId: opts?.correlationId },
    );
    return data.results ?? [];
  }

  private async authorizedPayments(
    preapprovalId: string,
    opts?: SubscriptionCallOpts,
  ): Promise<MpAuthorizedPayment[]> {
    const data = await this.call<{ results?: MpAuthorizedPayment[] }>(
      `authorized_payments/search?preapproval_id=${encodeURIComponent(preapprovalId)}`,
      undefined,
      { method: "GET", correlationId: opts?.correlationId },
    );
    return data.results ?? [];
  }

  /**
   * Wrapper único de HTTP contra MP (mismo patrón que FlowGateway.call):
   * bearer auth, JSON, timeout 15s y SIEMPRE emite GatewayTxEntry en el
   * finally - éxito, error HTTP o falla de red quedan auditados.
   * `auditAs` renombra el endpoint registrado cuando el nombre real
   * del recurso no calza con el que los sweeps esperan (preapproval
   * POST → "subscription/create").
   */
  private async call<T>(
    endpoint: string,
    body?: unknown,
    opts: {
      method?: "GET" | "POST" | "PUT";
      correlationId?: string;
      paymentId?: string;
      timeoutMs?: number;
      auditAs?: string;
    } = {},
  ): Promise<T> {
    const method = opts.method ?? "GET";
    const correlationId = opts.correlationId ?? randomUUID();
    const started = Date.now();
    let httpStatus: number | undefined;
    let responseBody: unknown;
    let ok = false;
    let error: string | undefined;
    try {
      const res = await fetch(`${this.baseUrl}/${endpoint}`, {
        method,
        headers: {
          authorization: `Bearer ${this.accessToken}`,
          ...(body !== undefined
            ? { "content-type": "application/json" }
            : undefined),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(opts.timeoutMs ?? 15_000),
      });
      httpStatus = res.status;
      const text = await res.text();
      try {
        responseBody = JSON.parse(text);
      } catch {
        responseBody = text;
      }
      ok = res.ok;
      if (!res.ok) {
        const detail = (responseBody as { message?: string } | null)
          ?.message;
        throw new Error(
          `mercadopago ${endpoint} HTTP ${res.status}${detail ? `: ${detail}` : ""}`,
        );
      }
      return responseBody as T;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      throw e;
    } finally {
      try {
        await this.onTx?.({
          provider: "MERCADOPAGO",
          direction: "OUTBOUND",
          endpoint: opts.auditAs ?? endpoint,
          correlationId,
          requestBody: sanitizeGatewayPayload(body),
          responseBody,
          httpStatus,
          durationMs: Date.now() - started,
          ok,
          error,
          paymentId: opts.paymentId,
        });
      } catch {
        // Auditoría best-effort: un writer que lance nunca rompe el call.
      }
    }
  }
}

/**
 * Extrae {tipo de recurso, id} de las formas de notificación de MP:
 * - Webhooks (nuevo): {type:"payment"|"subscription_authorized_payment"|
 *   "subscription_preapproval", data:{id:"123"}}.
 * - IPN (legacy): {topic:<mismo>, id:"123"} (o `resource` con el path
 *   del recurso: /v1/payments/123, /authorized_payments/123,
 *   /preapproval/abc-123).
 * Otros topics (merchant_order, etc.) → null.
 */
function extractNotification(body: unknown): {
  kind: "payment" | "authorized_payment" | "preapproval";
  id: string;
} | null {
  if (body == null || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const type = b.type ?? b.topic;
  const dataId = (b.data as Record<string, unknown> | undefined)?.id;
  const direct = dataId ?? b.id;
  const res = typeof b.resource === "string" ? b.resource : null;
  const fromResource = (re: RegExp) =>
    res != null ? (re.exec(res)?.[1] ?? null) : null;
  if (type === "payment") {
    const id = direct ?? fromResource(/\/v1\/payments\/(\d+)/);
    return id != null ? { kind: "payment", id: String(id) } : null;
  }
  if (type === "subscription_authorized_payment") {
    const id = direct ?? fromResource(/authorized_payments\/(\d+)/);
    return id != null
      ? { kind: "authorized_payment", id: String(id) }
      : null;
  }
  if (type === "subscription_preapproval") {
    const id = direct ?? fromResource(/preapproval\/([\w-]+)/);
    return id != null ? { kind: "preapproval", id: String(id) } : null;
  }
  return null;
}
