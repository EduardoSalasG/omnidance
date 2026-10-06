import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { PaymentGateway } from "../domain/ports";
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
const SUPPORTED_CURRENCIES = new Set([
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

  constructor(
    private readonly accessToken: string,
    private readonly baseUrl = "https://api.mercadopago.com",
    // notification_url del preference: `${API_URL}/api/payments/webhook/MERCADOPAGO`.
    private readonly notificationUrl = "",
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
   * Notificación MP (webhooks nuevo formato o IPN legacy) →
   * GET /v1/payments/:id → estado terminal normalizado.
   */
  async verifyWebhook(body: unknown): Promise<{
    refId: string;
    status: "PAID" | "FAILED";
    gatewayData?: unknown;
  }> {
    const paymentId = extractPaymentId(body);
    if (paymentId == null) {
      throw new Error("webhook mercadopago inválido");
    }
    const p = await this.call<MpPayment>(`v1/payments/${paymentId}`, {
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
      `mercadopago payment ${paymentId}: estado no terminal ${p.status}`,
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

  /**
   * Wrapper único de HTTP contra MP (mismo patrón que FlowGateway.call):
   * bearer auth, JSON, timeout 15s y SIEMPRE emite GatewayTxEntry en el
   * finally - éxito, error HTTP o falla de red quedan auditados.
   */
  private async call<T>(
    endpoint: string,
    body?: unknown,
    opts: {
      method?: "GET" | "POST";
      correlationId?: string;
      paymentId?: string;
      timeoutMs?: number;
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
          endpoint,
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
 * Extrae el payment id de las dos formas de notificación de MP:
 * - Webhooks (nuevo): {type:"payment", data:{id:"123"}}.
 * - IPN (legacy): {topic:"payment", id:"123"} (o resource:
 *   "/v1/payments/123" que lleva el id en el path).
 * Otros topics (merchant_order, etc.) → null: solo confirmamos pagos.
 */
function extractPaymentId(body: unknown): string | null {
  if (body == null || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (b.type === "payment") {
    const id = (b.data as Record<string, unknown> | undefined)?.id;
    return id != null ? String(id) : null;
  }
  if (b.topic === "payment") {
    if (b.id != null) return String(b.id);
    const res = b.resource;
    if (typeof res === "string") {
      const m = /\/v1\/payments\/(\d+)/.exec(res);
      if (m) return m[1];
    }
  }
  return null;
}
