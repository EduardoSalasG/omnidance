import { Injectable } from "@nestjs/common";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type {
  BillingWebhookEvent,
  PaymentGateway,
  RemoteSubscription,
  RemoteSubscriptionStatus,
  SubscriptionCallOpts,
  SubscriptionProvider,
  WebhookContext,
  WebhookVerification,
} from "../domain/ports";
import {
  sanitizeGatewayPayload,
  type GatewayTxEntry,
} from "./gateway-transactions.service";

// Stripe (https://stripe.com/docs/api): REST API con Bearer secret key y
// body form-urlencoded (application/x-www-form-urlencoded, params
// anidados con notación `objeto[indice][campo]`). Checkout = "Checkout
// Session" hosted (POST /v1/checkout/sessions, mode=payment; session.url
// es la página de pago; el id cs_… se persiste en Payment.gatewayRef y
// client_reference_id/metadata.refId llevan nuestra orden). Confirmación
// por webhook firmado (Stripe-Signature: HMAC-SHA256 de `${t}.${rawBody}`
// con el whsec_ del endpoint) → fetch-confirm GET de la sesión → estado
// terminal. La firma evita replay/inyección y el fetch-confirm devuelve
// la verdad real aunque el evento diga otra cosa (mismo patrón Fintoc).
//
// gatewayData se normaliza a la shape plana del puerto
// (NormalizedGatewayData): {fee, amount, media, transferDate, currency,
// raw}. El fee real sale del balance_transaction del cargo, expandido en
// la misma consulta de la sesión.
//
// Credenciales: STRIPE_SECRET_KEY (sk_test_/sk_live_) +
// STRIPE_WEBHOOK_SECRET (whsec_ del endpoint registrado en el dashboard
// apuntando a `${API_URL}/api/payments/webhook/STRIPE`, eventos
// checkout.session.completed + checkout.session.expired). El adapter no
// se registra sin secret key; el webhook exige ambos (fail-closed: sin
// whsec_ no hay firma verificable y el polling cubre la confirmación).

/**
 * Monedas zero-decimal de Stripe (tabla oficial): montos y fees se
 * expresan enteras en minor units - no hay centavos que multiplicar.
 */
const ZERO_DECIMAL_CURRENCIES = new Set([
  "BIF",
  "CLP",
  "DJF",
  "GNF",
  "JPY",
  "KMF",
  "KRW",
  "MGA",
  "PYG",
  "RWF",
  "UGX",
  "VND",
  "VUV",
  "XAF",
  "XOF",
  "XPF",
]);

/** Tolerancia de reloj para el timestamp `t` de la firma (anti-replay). */
const SIGNATURE_TOLERANCE_S = 300;

/**
 * Unidad mayor → minor units: ×100 salvo zero-decimal (CLP 5000 = 5000,
 * USD 25 = 2500, JPY 5000 = 5000). Exportado para el rail de desembolso
 * Connect (stripe-connect.rail.ts reutiliza la misma tabla).
 */
export function toMinorUnits(currency: string, amount: number): number {
  return ZERO_DECIMAL_CURRENCIES.has(currency.toUpperCase())
    ? amount
    : Math.round(amount * 100);
}

/** Minor units → unidad mayor (inversa de toMinorUnits). */
export function fromMinorUnits(currency: string, amount: number): number {
  return ZERO_DECIMAL_CURRENCIES.has(currency.toUpperCase())
    ? amount
    : amount / 100;
}

interface StripeBalanceTransaction {
  fee?: number;
  net?: number;
  amount?: number;
  currency?: string;
}

interface StripeCharge {
  id?: string;
  created?: number; // unix seconds
  payment_method_details?: { type?: string };
  balance_transaction?: StripeBalanceTransaction | string | null;
}

interface StripePaymentIntent {
  id?: string;
  latest_charge?: StripeCharge | string | null;
}

interface StripeSession {
  id?: string;
  object?: string;
  status?: string; // open | complete | expired
  payment_status?: string; // paid | unpaid | no_payment_required
  mode?: string; // payment | subscription | setup
  amount_total?: number | null;
  currency?: string;
  client_reference_id?: string | null;
  customer?: string | { id?: string } | null;
  subscription?: string | { id?: string } | null;
  subscription_data?: { metadata?: Record<string, string | undefined> };
  metadata?: Record<string, string | undefined>;
  payment_method_types?: string[];
  payment_intent?: StripePaymentIntent | string | null;
}

// ─── Billing (spec pase-social) ───
// Eventos de suscripción del mismo endpoint firmado: invoice.* (cobro
// de período), customer.subscription.* (estado de la sub) y Checkout
// mode=subscription (la sesión que cobra tarjeta + primer período).
interface StripeInvoice {
  id?: string;
  status?: string; // draft|open|paid|uncollectible|void
  amount_paid?: number;
  total?: number;
  currency?: string;
  customer?: string | { id?: string } | null;
  subscription?: string | { id?: string } | null;
  period_start?: number;
  period_end?: number;
  metadata?: Record<string, string | undefined>;
  // API 2025+ (Basil): la suscripción cuelga de parent.subscription_details.
  parent?: {
    subscription_details?: {
      subscription?: string | { id?: string } | null;
      metadata?: Record<string, string | undefined>;
    };
  };
  lines?: { data?: { period?: { start?: number; end?: number } }[] };
}

interface StripeSubscription {
  id?: string;
  status?: string;
  cancel_at_period_end?: boolean;
  current_period_end?: number; // API ≤2024; en Basil vive en items
  items?: { data?: { current_period_end?: number }[] };
  latest_invoice?: StripeInvoice | string | null;
  customer?: string | { id?: string } | null;
  metadata?: Record<string, string | undefined>;
}

interface StripePrice {
  id?: string;
  product?: string | { id?: string } | null;
  unit_amount?: number | null;
  currency?: string;
  active?: boolean;
  lookup_key?: string | null;
  metadata?: Record<string, string | undefined>;
}

interface StripeList<T> {
  data?: T[];
}

function idOf(v: string | { id?: string } | null | undefined): string | undefined {
  return typeof v === "string" ? v : v?.id;
}

const toIso = (unix?: number): string | undefined =>
  typeof unix === "number" ? new Date(unix * 1000).toISOString() : undefined;

/** lookup_key del Price espejo: omni_<planId>_<currency> (idempotencia). */
const planLookupKey = (planId: string, currency: string) =>
  `omni_${planId}_${currency.toLowerCase()}`;

/** Stripe status → RemoteSubscriptionStatus (spec subscription-port-generic). */
function normalizeSubscription(s: StripeSubscription): RemoteSubscription {
  const raw = s.status ?? "";
  let status: RemoteSubscriptionStatus;
  if (raw === "active" || raw === "trialing") status = "ACTIVE";
  else if (raw === "canceled") status = "CANCELED";
  else if (raw.startsWith("incomplete")) status = "PENDING";
  else if (raw === "past_due" || raw === "unpaid") status = "ACTIVE"; // morosa vigente
  else status = "UNKNOWN";
  const inv =
    s.latest_invoice && typeof s.latest_invoice === "object"
      ? s.latest_invoice
      : undefined;
  const periodEndUnix =
    s.current_period_end ?? s.items?.data?.[0]?.current_period_end;
  const currency = inv?.currency?.toUpperCase();
  const paidAmount = inv?.amount_paid ?? inv?.total;
  return {
    subscriptionId: s.id ?? "",
    planId: s.metadata?.planId ?? "",
    status,
    rawStatus: status === "UNKNOWN" ? raw : undefined,
    // Morosa: proveedor la reporta past_due/unpaid, o la última invoice
    // quedó incobrable tras los reintentos.
    morose:
      raw === "past_due" || raw === "unpaid" || inv?.status === "uncollectible",
    cancelAtPeriodEnd: s.cancel_at_period_end === true,
    nextInvoiceDate: toIso(periodEndUnix),
    invoices: inv?.id
      ? [
          {
            id: inv.id,
            amount:
              currency && paidAmount != null
                ? fromMinorUnits(currency, paidAmount)
                : 0,
            paid: inv.status === "paid",
            periodStart: toIso(inv.period_start),
            periodEnd: toIso(inv.period_end),
          },
        ]
      : undefined,
  };
}

/**
 * invoice.* → BillingWebhookEvent (spec pase-social): el objeto firmado
 * trae subscription (o parent.subscription_details en API Basil),
 * customer, metadata.personId y los períodos - no requiere fetch.
 */
function billingFromInvoice(
  type: string,
  inv: StripeInvoice,
): BillingWebhookEvent {
  const currency = inv.currency?.toUpperCase() ?? "";
  const line = inv.lines?.data?.[0]?.period;
  const paidAmount = inv.amount_paid ?? inv.total;
  return {
    type,
    personId:
      inv.parent?.subscription_details?.metadata?.personId ??
      inv.metadata?.personId,
    // Marca del pase (spec multipais-currency): subscription_details.
    // metadata es la metadata de la suscripción - la invoice propia
    // también se respeta por si el caller la seteó.
    socialPass:
      inv.parent?.subscription_details?.metadata?.socialPass === "1" ||
      inv.metadata?.socialPass === "1",
    customerId: idOf(inv.customer),
    subscriptionId:
      idOf(inv.subscription) ??
      idOf(inv.parent?.subscription_details?.subscription),
    invoice: inv.id
      ? {
          id: inv.id,
          amount:
            currency && paidAmount != null
              ? fromMinorUnits(currency, paidAmount)
              : 0,
          currency,
          periodStart: toIso(line?.start ?? inv.period_start),
          periodEnd: toIso(line?.end ?? inv.period_end),
          paid: inv.status === "paid",
        }
      : undefined,
    raw: inv,
  };
}

/** El charge expandido de la sesión (sin expand llega como string id). */
function chargeOf(s: StripeSession): StripeCharge | undefined {
  const pi = s.payment_intent;
  if (!pi || typeof pi === "string") return undefined;
  const ch = pi.latest_charge;
  if (!ch || typeof ch === "string") return undefined;
  return ch;
}

/**
 * session → NormalizedGatewayData. fee = balance_transaction.fee (el
 * costo real que Stripe se quedó), amount = amount_total; ambos en
 * unidad mayor según la tabla zero-decimal.
 */
function normalizeSession(s: StripeSession): Record<string, unknown> {
  const charge = chargeOf(s);
  const bt = charge?.balance_transaction;
  const feeMinor = bt && typeof bt === "object" ? bt.fee : undefined;
  const currency = s.currency?.toUpperCase();
  return {
    fee:
      currency && feeMinor != null
        ? fromMinorUnits(currency, feeMinor)
        : undefined,
    amount:
      currency && s.amount_total != null
        ? fromMinorUnits(currency, s.amount_total)
        : undefined,
    media:
      charge?.payment_method_details?.type ?? s.payment_method_types?.[0],
    transferDate: charge?.created
      ? new Date(charge.created * 1000).toISOString()
      : undefined,
    currency,
    raw: s,
  };
}

/**
 * Verifica `Stripe-Signature` = `t=<unix>,v1=<hex>[,v1=<hex>…]` donde
 * v1 = HMAC-SHA256(secret, `${t}.${rawBody}`). Comparación timing-safe
 * contra CADA v1 (Stripe rota secrets emitiendo varias firmas) + ventana
 * de 5min (anti-replay, mismo patrón Fintoc).
 */
function verifySignature(
  rawBody: string,
  header: string,
  secret: string,
): void {
  let t: string | undefined;
  const signatures: string[] = [];
  for (const kv of header.split(",")) {
    const [k, v] = kv.split("=", 2);
    if (k?.trim() === "t") t = v?.trim();
    if (k?.trim() === "v1" && v?.trim()) signatures.push(v.trim());
  }
  if (!t || !signatures.length) {
    throw new Error("stripe firma: header malformado");
  }
  const ts = Number(t);
  if (!Number.isFinite(ts)) throw new Error("stripe firma: t inválido");
  if (Math.abs(Date.now() / 1000 - ts) > SIGNATURE_TOLERANCE_S) {
    throw new Error("stripe firma: timestamp fuera de tolerancia");
  }
  const expected = createHmac("sha256", secret)
    .update(`${t}.${rawBody}`)
    .digest("hex");
  const a = Buffer.from(expected, "utf8");
  const ok = signatures.some((v1) => {
    const b = Buffer.from(v1, "utf8");
    return a.length === b.length && timingSafeEqual(a, b);
  });
  if (!ok) throw new Error("stripe firma: no verifica");
}

@Injectable()
export class StripeGateway implements PaymentGateway, SubscriptionProvider {
  readonly name = "STRIPE";
  // Sin whitelist propia: si Stripe soporta la moneda, pasa (el routing
  // por moneda del registry lo trata como sin restricción declarada).

  constructor(
    private readonly secretKey: string,
    private readonly webhookSecret: string,
    private readonly baseUrl = "https://api.stripe.com",
    // El endpoint webhook se registra en el dashboard apuntando a
    // `${API_URL}/api/payments/webhook/STRIPE` (documentado).
    private readonly onTx?: (e: GatewayTxEntry) => Promise<void>,
    // Cuenta propia del productor (spec connect-own-gateway): cuando
    // viene, TODA request lleva `Stripe-Account: acct_…` - la auth sigue
    // siendo la secret key de plataforma y el cargo es "direct charge"
    // en la cuenta Connect conectada (createOrder crea la sesión ahí;
    // fetchSession la lee ahí también - sin el header la sesión cs_…
    // no existe para la cuenta plataforma).
    private readonly stripeAccount?: string,
  ) {}

  async createOrder(p: {
    refId: string;
    amount: number;
    email: string;
    returnUrl: string;
    currency?: string;
  }): Promise<{ paymentUrl: string; gatewayRef: string }> {
    const currency = (p.currency ?? "CLP").toUpperCase();
    const data = await this.call<{ id?: string; url?: string }>(
      "v1/checkout/sessions",
      {
        mode: "payment",
        "line_items[0][price_data][currency]": currency.toLowerCase(),
        "line_items[0][price_data][unit_amount]": String(
          toMinorUnits(currency, p.amount),
        ),
        // El refId codifica el tipo de orden (tkt_/sp_/mem_/wks_/pvt_) -
        // el nombre del ítem refleja qué se está comprando (mismo
        // criterio MP/Flow, ampliado a las órdenes de academia).
        "line_items[0][price_data][product_data][name]": p.refId.startsWith(
          "mem_",
        )
          ? "Plan Omnidance"
          : p.refId.startsWith("sp_")
            ? "Pase de serie Omnidance"
            : p.refId.startsWith("pvt_")
              ? "Clase particular Omnidance"
              : p.refId.startsWith("wks_")
                ? "Workshop Omnidance"
                : "Ticket Omnidance",
        "line_items[0][quantity]": "1",
        // refId duplicado: client_reference_id indexa en Stripe y
        // metadata.refId viaja dentro del objeto (redundancia deliberada).
        client_reference_id: p.refId,
        "metadata[refId]": p.refId,
        customer_email: p.email,
        success_url: p.returnUrl,
        cancel_url: p.returnUrl,
        // card + link: Stripe Link es el checkout acelerado del comprador
        // - si la cuenta no lo tiene habilitado, Stripe lo ignora.
        "payment_method_types[0]": "card",
        "payment_method_types[1]": "link",
      },
      { method: "POST" },
    );
    if (!data.id || !data.url) {
      throw new Error("stripe createOrder: respuesta sin url de checkout");
    }
    return { paymentUrl: data.url, gatewayRef: data.id };
  }

  /**
   * Webhook Stripe: valida `Stripe-Signature` sobre el body crudo (ctx
   * obligatorio para este adaptador - sin firma/secret/rawBody se
   * rechaza, fail-closed como Fintoc) y confirma la sesión por GET con
   * expand: el evento solo dice QUÉ sesión mirar, nunca se liquida desde
   * su payload. Cualquier checkout.session.* entra aquí - el
   * fetch-confirm decide (estado no terminal → error → Stripe reintenta).
   */
  /**
   * Webhook Stripe (spec pase-social): firma compartida `Stripe-Signature`
   * sobre el body crudo, luego routing por event.type:
   * - `invoice.*` / `customer.subscription.*` → variante `billing` (el
   *   objeto del evento ya trae subscription/customer/metadata - sin
   *   Payment asociado ni fetch-confirm: la firma es la verificación).
   * - `checkout.session.*` mode=subscription → `billing` (metadata.
   *   personId + subscription del objeto, sin fetch - no hay refId).
   * - `checkout.session.*` mode=payment → fetch-confirm de la sesión
   *   con expand → refId + estado terminal + gatewayData (el flujo de
   *   órdenes de siempre).
   */
  async verifyWebhook(
    body: unknown,
    ctx?: WebhookContext,
  ): Promise<WebhookVerification> {
    const header = ctx?.headers?.["stripe-signature"];
    const sig = Array.isArray(header) ? header[0] : header;
    if (!sig || !ctx?.rawBody || !this.webhookSecret) {
      throw new Error("stripe webhook: firma ausente o sin rawBody");
    }
    verifySignature(ctx.rawBody, sig, this.webhookSecret);

    const event = body as {
      type?: string;
      data?: { object?: Record<string, unknown> & { id?: string } };
    };
    const type = event?.type ?? "";
    const obj = event?.data?.object;

    // Eventos de billing de suscripción (spec pase-social): el objeto es
    // la invoice o la subscription misma - se traduce y el controller lo
    // rutea a SocialPassService (no hay Payment que liquidar).
    if (/^invoice\./.test(type) && obj) {
      return { billing: billingFromInvoice(type, obj as StripeInvoice) };
    }
    if (/^customer\.subscription\./.test(type) && obj) {
      const sub = obj as StripeSubscription;
      return {
        billing: {
          type,
          personId: sub.metadata?.personId,
          customerId: idOf(sub.customer),
          subscriptionId: sub.id,
          socialPass: sub.metadata?.socialPass === "1",
          raw: obj,
        } satisfies BillingWebhookEvent,
      };
    }
    if (/^checkout\.session\./.test(type) && obj) {
      const s = obj as StripeSession;
      if (s.mode === "subscription") {
        return {
          billing: {
            type,
            personId:
              s.subscription_data?.metadata?.personId ?? s.metadata?.personId,
            customerId: idOf(s.customer),
            subscriptionId: idOf(s.subscription),
            // La metadata de subscription_data es la que Stripe copia a
            // la sub creada - la marca del pase vive ahí, no en la de
            // la sesión (metadata[socialPass] ya no se setea siempre).
            socialPass:
              s.subscription_data?.metadata?.socialPass === "1",
            raw: obj,
          } satisfies BillingWebhookEvent,
        };
      }
    }

    const sessionId = obj?.id;
    if (typeof sessionId !== "string" || !sessionId) {
      throw new Error("stripe webhook: evento sin sesión");
    }
    const s = await this.fetchSession(sessionId);
    const refId = s.client_reference_id ?? s.metadata?.refId;
    if (typeof refId !== "string" || !refId) {
      throw new Error(`stripe session ${sessionId}: sin refId`);
    }
    const gatewayData = normalizeSession(s);
    if (s.payment_status === "paid") {
      return { refId, status: "PAID", gatewayData };
    }
    if (s.status === "expired") {
      return { refId, status: "FAILED", gatewayData };
    }
    throw new Error(
      `stripe session ${sessionId}: estado no terminal ${s.status}/${s.payment_status}`,
    );
  }

  /**
   * Polling del checkout: la sesión solo es consultable por su id
   * `cs_…` (persistido en Payment.gatewayRef) - no hay búsqueda por
   * metadata. Sin gatewayRef no hay nada que consultar → PENDING.
   */
  async refreshStatus(
    _refId: string,
    ctx?: { gatewayRef?: string | null },
  ): Promise<{
    status: "PAID" | "FAILED" | "PENDING";
    gatewayData?: unknown;
  }> {
    if (!ctx?.gatewayRef) return { status: "PENDING" };
    const s = await this.fetchSession(ctx.gatewayRef);
    const gatewayData = normalizeSession(s);
    if (s.payment_status === "paid") {
      return { status: "PAID", gatewayData };
    }
    if (s.status === "expired") {
      return { status: "FAILED", gatewayData };
    }
    return { status: "PENDING", gatewayData };
  }

  /**
   * GET de la sesión con expand del payment_intent hasta su
   * balance_transaction: una sola consulta trae estado terminal, medio
   * de pago usado y el fee real reportado.
   */
  private fetchSession(id: string): Promise<StripeSession> {
    return this.call<StripeSession>(
      `v1/checkout/sessions/${encodeURIComponent(id)}` +
        "?expand[]=payment_intent" +
        "&expand[]=payment_intent.latest_charge" +
        "&expand[]=payment_intent.latest_charge.balance_transaction",
      undefined,
      { method: "GET" },
    );
  }

  // ---------- Suscripciones (SubscriptionProvider - spec pase-social) ----------
  // Stripe Billing en la cuenta de PLATAFORMA (no Connect): el plan
  // espejo es Product+Price mensual con lookup_key omni_<planId>_<cur>;
  // el "registro de tarjeta" ES la Checkout Session mode=subscription
  // (cobra tarjeta + primer período en un paso). Los consumers
  // (SocialPassService) resuelven este adaptador EXPLÍCITAMENTE por
  // name - el param payments.subscription_gateway sigue gobernando las
  // suscripciones de academia/productor (Flow) y no se toca.

  /** Price espejo vigente por lookup_key; null si aún no existe. */
  private async priceByLookup(
    planId: string,
    currency: string,
    opts?: SubscriptionCallOpts,
  ): Promise<StripePrice | null> {
    const list = await this.call<StripeList<StripePrice>>(
      `v1/prices?lookup_key=${encodeURIComponent(planLookupKey(planId, currency))}&active=true&limit=1`,
      undefined,
      { method: "GET", correlationId: opts?.correlationId },
    );
    return list.data?.[0] ?? null;
  }

  /** ensurePlan: el Price existe → no-op; si no, Product + Price nuevo. */
  async ensurePlan(
    p: {
      planId: string;
      name: string;
      amount: number;
      intervalCount: number;
      currency?: string;
    },
    opts?: SubscriptionCallOpts,
  ): Promise<void> {
    const currency = (p.currency ?? "CLP").toUpperCase();
    const existing = await this.priceByLookup(p.planId, currency, opts);
    if (existing?.id) return;
    const product = await this.call<{ id?: string }>(
      "v1/products",
      { name: p.name, "metadata[planId]": p.planId },
      { correlationId: opts?.correlationId },
    );
    if (!product.id) {
      throw new Error("stripe ensurePlan: respuesta sin product id");
    }
    await this.call<unknown>(
      "v1/prices",
      {
        product: product.id,
        currency: currency.toLowerCase(),
        unit_amount: String(toMinorUnits(currency, p.amount)),
        "recurring[interval]": "month",
        "recurring[interval_count]": String(p.intervalCount),
        lookup_key: planLookupKey(p.planId, currency),
        "metadata[planId]": p.planId,
      },
      { correlationId: opts?.correlationId },
    );
  }

  /**
   * syncPlan: el Price de Stripe es inmutable → se desactiva el vigente
   * y se crea uno nuevo (el lookup_key queda en el precio nuevo); el
   * nombre se empuja al Product. Sin precio existente → ensurePlan.
   */
  async syncPlan(
    p: { planId: string; name: string; amount: number; currency?: string },
    opts?: SubscriptionCallOpts,
  ): Promise<void> {
    const currency = (p.currency ?? "CLP").toUpperCase();
    const existing = await this.priceByLookup(p.planId, currency, opts);
    if (!existing?.id) {
      await this.ensurePlan(
        { ...p, intervalCount: 1, currency },
        opts,
      );
      return;
    }
    const productId = idOf(existing.product);
    if (productId) {
      await this.call<unknown>(
        `v1/products/${encodeURIComponent(productId)}`,
        { name: p.name },
        { correlationId: opts?.correlationId },
      );
    }
    const nextAmount = toMinorUnits(currency, p.amount);
    if (existing.unit_amount === nextAmount) return;
    await this.call<unknown>(
      `v1/prices/${encodeURIComponent(existing.id)}`,
      { active: "false" },
      { correlationId: opts?.correlationId },
    );
    await this.call<unknown>(
      "v1/prices",
      {
        product: productId ?? "",
        currency: currency.toLowerCase(),
        unit_amount: String(nextAmount),
        "recurring[interval]": "month",
        "recurring[interval_count]": "1",
        lookup_key: planLookupKey(p.planId, currency),
        "metadata[planId]": p.planId,
      },
      { correlationId: opts?.correlationId },
    );
  }

  async createCustomer(
    p: { email: string; name: string; externalId: string },
    opts?: SubscriptionCallOpts,
  ): Promise<{ customerId: string }> {
    const data = await this.call<{ id?: string }>(
      "v1/customers",
      {
        email: p.email,
        name: p.name,
        "metadata[externalId]": p.externalId,
      },
      { correlationId: opts?.correlationId },
    );
    if (!data.id) {
      throw new Error("stripe createCustomer: respuesta inválida");
    }
    return { customerId: data.id };
  }

  /**
   * Rescate de customerId por email (spec pase-social): la fila
   * SocialPass se perdió/nunca se escribió → GET /v1/customers?email=.
   */
  async findCustomerByEmail(
    email: string,
    opts?: SubscriptionCallOpts,
  ): Promise<{ customerId: string } | null> {
    const list = await this.call<StripeList<{ id?: string }>>(
      `v1/customers?email=${encodeURIComponent(email)}&limit=1`,
      undefined,
      { method: "GET", correlationId: opts?.correlationId },
    );
    const id = list.data?.[0]?.id;
    return id ? { customerId: id } : null;
  }

  /**
   * `hasCard` = el customer tiene default_payment_method expandido en
   * invoice_settings (la tarjeta que Checkout dejó como recurrente).
   */
  async getCustomer(
    customerId: string,
    opts?: SubscriptionCallOpts,
  ): Promise<{ hasCard: boolean }> {
    const data = await this.call<{
      invoice_settings?: { default_payment_method?: unknown };
    }>(
      `v1/customers/${encodeURIComponent(customerId)}?expand[]=invoice_settings.default_payment_method`,
      undefined,
      { method: "GET", correlationId: opts?.correlationId },
    );
    return { hasCard: data.invoice_settings?.default_payment_method != null };
  }

  /**
   * El "registro de tarjeta" del pase (spec pase-social): Stripe cobra
   * tarjeta + primer período en un paso → Checkout Session
   * mode=subscription. `planId`+`currency` resuelven el Price espejo
   * (debe existir - el caller corre ensurePlan antes); metadata ata la
   * suscripción al person para el routing del webhook.
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
    if (!p.planId) {
      throw new Error(
        "stripe registerCustomerCard: planId requerido (Checkout mode=subscription cobra el Price espejo)",
      );
    }
    const price = await this.priceByLookup(
      p.planId,
      p.currency ?? "CLP",
      opts,
    );
    if (!price?.id) {
      throw new Error(
        `stripe registerCustomerCard: sin Price espejo para ${p.planId} - falta ensurePlan`,
      );
    }
    const params: Record<string, string> = {
      mode: "subscription",
      customer: p.customerId,
      "line_items[0][price]": price.id,
      "line_items[0][quantity]": "1",
      success_url: p.returnUrl,
      cancel_url: p.returnUrl,
      "payment_method_types[0]": "card",
      "payment_method_types[1]": "link",
    };
    // La marca del pase (`socialPass`) la aporta el caller en
    // p.metadata cuando corresponde - nunca se setea de fábrica:
    // una sesión de membresía/plataforma no es del Pase Social (spec
    // multipais-currency, contaminación cruzada de credits).
    for (const [k, v] of Object.entries(p.metadata ?? {})) {
      params[`subscription_data[metadata][${k}]`] = v;
      params[`metadata[${k}]`] = v;
    }
    const data = await this.call<{ id?: string; url?: string }>(
      "v1/checkout/sessions",
      params,
      { correlationId: opts?.correlationId },
    );
    if (!data.url) {
      throw new Error("stripe registerCustomerCard: sesión sin url");
    }
    return { registerUrl: data.url };
  }

  /**
   * token = id de la Checkout Session (cs_…): GET con subscription
   * expandida → registered cuando la sesión completó y la sub existe.
   * Devuelve customerId + subscriptionId para que el service persista
   * el SocialPass sin consulta extra (spec pase-social).
   */
  async getRegisterStatus(
    token: string,
    opts?: SubscriptionCallOpts,
  ): Promise<{
    registered: boolean;
    customerId?: string;
    subscriptionId?: string;
  }> {
    const s = await this.call<StripeSession>(
      `v1/checkout/sessions/${encodeURIComponent(token)}?expand[]=subscription`,
      undefined,
      { method: "GET", correlationId: opts?.correlationId },
    );
    return {
      registered: s.status === "complete" && s.subscription != null,
      customerId: idOf(s.customer),
      subscriptionId: idOf(s.subscription),
    };
  }

  /**
   * createSubscription directo (spec pase-social): subs nueva sobre un
   * customer con tarjeta ya registrada (Checkout no es necesario). El
   * precio se resuelve por lookup_key del planId; subscriptionStart no
   * aplica (Stripe inicia el ciclo ya - el caller no lo usa en v1).
   */
  async createSubscription(
    p: {
      planId: string;
      customerId: string;
      subscriptionStart: string;
      currency?: string;
    },
    opts?: SubscriptionCallOpts,
  ): Promise<RemoteSubscription> {
    // El Price espejo se resuelve por lookup_key omni_<planId>_<cur> de
    // la moneda del cargo (spec multipais-currency): un planId
    // compartido entre mercados tiene un Price por moneda y el CLP no
    // puede ganar por default. Fallback: cualquier Price activo cuyo
    // metadata.planId y moneda calcen (espejo creado fuera de ensurePlan).
    const currency = (p.currency ?? "CLP").toUpperCase();
    let price = await this.priceByLookup(p.planId, currency, opts);
    if (!price?.id) {
      const list = await this.call<StripeList<StripePrice>>(
        "v1/prices?active=true&limit=100",
        undefined,
        { method: "GET", correlationId: opts?.correlationId },
      );
      price =
        list.data?.find(
          (pr) =>
            pr.id != null &&
            pr.metadata?.planId === p.planId &&
            (pr.currency ?? "").toUpperCase() === currency,
        ) ?? null;
    }
    if (!price?.id) {
      throw new Error(
        `stripe createSubscription: sin Price espejo para ${p.planId} (${currency})`,
      );
    }
    const data = await this.call<StripeSubscription>(
      "v1/subscriptions",
      {
        customer: p.customerId,
        "items[0][price]": price.id,
        "metadata[planId]": p.planId,
      },
      { correlationId: opts?.correlationId },
    );
    return normalizeSubscription(data);
  }

  /**
   * GET /v1/subscriptions/:id con latest_invoice expandida →
   * RemoteSubscription (status/morose/cancelAtPeriodEnd/nextInvoiceDate).
   */
  async getSubscription(
    subscriptionId: string,
    opts?: SubscriptionCallOpts,
  ): Promise<RemoteSubscription> {
    const data = await this.call<StripeSubscription>(
      `v1/subscriptions/${encodeURIComponent(subscriptionId)}?expand[]=latest_invoice`,
      undefined,
      { method: "GET", correlationId: opts?.correlationId },
    );
    return normalizeSubscription(data);
  }

  /**
   * Suscripciones del customer (spec pase-social): la vuelta de Checkout
   * no trae el sub id - el confirm por polling lista `status=all` del
   * customer y toma la más reciente.
   */
  async listCustomerSubscriptions(
    customerId: string,
    opts?: SubscriptionCallOpts,
  ): Promise<RemoteSubscription[]> {
    const list = await this.call<StripeList<StripeSubscription>>(
      `v1/subscriptions?customer=${encodeURIComponent(customerId)}&status=all&limit=5`,
      undefined,
      { method: "GET", correlationId: opts?.correlationId },
    );
    return (list.data ?? []).map(normalizeSubscription);
  }

  /**
   * cancel_at_period_end por defecto (el acceso vive hasta el fin del
   * período pagado); `immediate` → DELETE de la sub - solo para
   * compensar una remota huérfana, nunca la cancelación del usuario.
   */
  async cancelSubscription(
    subscriptionId: string,
    opts?: SubscriptionCallOpts & { immediate?: boolean },
  ): Promise<void> {
    if (opts?.immediate) {
      await this.call<unknown>(
        `v1/subscriptions/${encodeURIComponent(subscriptionId)}`,
        undefined,
        { method: "DELETE", correlationId: opts?.correlationId },
      );
      return;
    }
    await this.call<unknown>(
      `v1/subscriptions/${encodeURIComponent(subscriptionId)}`,
      { cancel_at_period_end: "true" },
      { correlationId: opts?.correlationId },
    );
  }

  /**
   * Wrapper único de HTTP contra Stripe (mismo patrón que Flow/MP/
   * Fintoc): bearer auth, form-urlencoded en POST, timeout 15s y SIEMPRE
   * emite GatewayTxEntry en el finally - éxito, error HTTP o falla de
   * red quedan auditados.
   */
  private async call<T>(
    endpoint: string,
    params?: Record<string, string>,
    opts: {
      method?: "GET" | "POST" | "DELETE";
      correlationId?: string;
      paymentId?: string;
      timeoutMs?: number;
    } = {},
  ): Promise<T> {
    const method = opts.method ?? (params !== undefined ? "POST" : "GET");
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
          authorization: `Bearer ${this.secretKey}`,
          ...(params !== undefined
            ? { "content-type": "application/x-www-form-urlencoded" }
            : undefined),
          // Direct charge Connect: presente solo si el adaptador se
          // construyó para una cuenta propia del productor.
          ...(this.stripeAccount
            ? { "Stripe-Account": this.stripeAccount }
            : undefined),
        },
        body:
          params !== undefined
            ? new URLSearchParams(params).toString()
            : undefined,
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
        const detail = (
          responseBody as { error?: { message?: string } } | null
        )?.error?.message;
        throw new Error(
          `stripe ${endpoint} HTTP ${res.status}${detail ? `: ${detail}` : ""}`,
        );
      }
      return responseBody as T;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      throw e;
    } finally {
      try {
        await this.onTx?.({
          provider: "STRIPE",
          direction: "OUTBOUND",
          endpoint,
          correlationId,
          requestBody: sanitizeGatewayPayload(params),
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
