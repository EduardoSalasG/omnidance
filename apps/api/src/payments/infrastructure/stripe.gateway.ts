import { Injectable } from "@nestjs/common";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { PaymentGateway, WebhookContext } from "../domain/ports";
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
  amount_total?: number | null;
  currency?: string;
  client_reference_id?: string | null;
  metadata?: Record<string, string | undefined>;
  payment_method_types?: string[];
  payment_intent?: StripePaymentIntent | string | null;
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
export class StripeGateway implements PaymentGateway {
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
  async verifyWebhook(
    body: unknown,
    ctx?: WebhookContext,
  ): Promise<{
    refId: string;
    status: "PAID" | "FAILED";
    gatewayData?: unknown;
  }> {
    const header = ctx?.headers?.["stripe-signature"];
    const sig = Array.isArray(header) ? header[0] : header;
    if (!sig || !ctx?.rawBody || !this.webhookSecret) {
      throw new Error("stripe webhook: firma ausente o sin rawBody");
    }
    verifySignature(ctx.rawBody, sig, this.webhookSecret);

    const event = body as {
      type?: string;
      data?: { object?: { id?: string } };
    };
    const sessionId = event?.data?.object?.id;
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
      method?: "GET" | "POST";
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
