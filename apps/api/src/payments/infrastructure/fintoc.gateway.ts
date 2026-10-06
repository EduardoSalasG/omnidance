import { Injectable } from "@nestjs/common";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { PaymentGateway, WebhookContext } from "../domain/ports";
import {
  sanitizeGatewayPayload,
  type GatewayTxEntry,
} from "./gateway-transactions.service";

// Fintoc (https://fintoc.com/docs): REST API con Bearer secret key.
// Checkout = "checkout session" (POST /v2/checkout_sessions, flow
// "payment"; redirect_url es la página de pago hospedada; el id cs_…
// se persiste en Payment.gatewayRef y metadata.refId lleva nuestra
// orden). Confirmación por webhook firmado (Fintoc-Signature:
// HMAC-SHA256 de `${t}.${rawBody}` con el secret del endpoint) →
// fetch-confirm GET /v2/checkout_sessions/:id → estado terminal.
// La firma evita replay/inyección y el fetch-confirm devuelve la verdad
// real aunque el evento diga otra cosa.
//
// gatewayData se normaliza a la shape plana del puerto
// (NormalizedGatewayData): {fee, amount, media, transferDate,
// currency, raw}. A2A no reporta fee por sesión - queda undefined.
//
// Credenciales: FINTOC_SECRET_KEY (sk_live_/sk_test_) +
// FINTOC_WEBHOOK_SECRET (whsec_ del endpoint registrado). El adapter
// no se registra sin secret key; el webhook exige ambos.

/** Monedas del checkout session (API v2, hoy CL y MX). */
const SUPPORTED_CURRENCIES = new Set(["CLP", "MXN"]);

/** Tolerancia de reloj para el timestamp `t` de la firma (anti-replay). */
const SIGNATURE_TOLERANCE_S = 300;

interface FintocSession {
  id?: string;
  status?: string;
  amount?: number | null;
  currency?: string;
  payment_method?: string | { type?: string } | null;
  finished_at?: string;
  metadata?: Record<string, unknown>;
}

/** Estados terminales de una checkout session (docs Fintoc). */
const PAID_SESSION = new Set(["finished", "succeeded", "paid"]);
const FAILED_SESSION = new Set(["expired", "canceled", "failed"]);

function normalizeSession(s: FintocSession): Record<string, unknown> {
  const media =
    typeof s.payment_method === "string"
      ? s.payment_method
      : s.payment_method?.type;
  return {
    amount: s.amount ?? undefined,
    media,
    transferDate: s.finished_at,
    currency: s.currency,
    raw: s,
  };
}

/**
 * Verifica `Fintoc-Signature` = `t=<unix>,v1=<hex>` donde
 * v1 = HMAC-SHA256(secret, `${t}.${rawBody}`). Comparación
 * timing-safe + ventana de 5min (anti-replay, mismo patrón Stripe).
 */
function verifySignature(
  rawBody: string,
  header: string,
  secret: string,
): void {
  const parts = new Map(
    header.split(",").map((kv) => {
      const [k, v] = kv.split("=", 2);
      return [k?.trim() ?? "", v?.trim() ?? ""] as const;
    }),
  );
  const t = parts.get("t");
  const v1 = parts.get("v1");
  if (!t || !v1) throw new Error("fintoc firma: header malformado");
  const ts = Number(t);
  if (!Number.isFinite(ts)) throw new Error("fintoc firma: t inválido");
  if (Math.abs(Date.now() / 1000 - ts) > SIGNATURE_TOLERANCE_S) {
    throw new Error("fintoc firma: timestamp fuera de tolerancia");
  }
  const expected = createHmac("sha256", secret)
    .update(`${t}.${rawBody}`)
    .digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(v1, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new Error("fintoc firma: no verifica");
  }
}

@Injectable()
export class FintocGateway implements PaymentGateway {
  readonly name = "FINTOC";

  constructor(
    private readonly secretKey: string,
    private readonly webhookSecret: string,
    private readonly baseUrl = "https://api.fintoc.com",
    // notification_url no se configura por sesión en la API v2 - el
    // endpoint se registra en el dashboard apuntando a
    // `${API_URL}/api/payments/webhook/FINTOC` (documentado).
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
      throw new Error(`fintoc createOrder: moneda no soportada ${currency}`);
    }
    const data = await this.call<{
      id?: string;
      redirect_url?: string;
    }>("v2/checkout_sessions", {
      flow: "payment",
      amount: p.amount,
      currency,
      success_url: p.returnUrl,
      cancel_url: p.returnUrl,
      customer_email: p.email,
      metadata: { refId: p.refId },
    });
    if (!data.id || !data.redirect_url) {
      throw new Error("fintoc createOrder: respuesta sin redirect_url");
    }
    return { paymentUrl: data.redirect_url, gatewayRef: data.id };
  }

  /**
   * Webhook Fintoc: valida la firma sobre el body crudo (ctx obligatorio
   * para este adaptador) y confirma la sesión por GET - el evento solo
   * dice QUÉ sesión mirar, nunca se liquida desde su payload.
   */
  async verifyWebhook(
    body: unknown,
    ctx?: WebhookContext,
  ): Promise<{
    refId: string;
    status: "PAID" | "FAILED";
    gatewayData?: unknown;
  }> {
    const header = ctx?.headers?.["fintoc-signature"];
    const sig = Array.isArray(header) ? header[0] : header;
    if (!sig || !ctx?.rawBody) {
      throw new Error("fintoc webhook: firma ausente o sin rawBody");
    }
    verifySignature(ctx.rawBody, sig, this.webhookSecret);

    const event = body as {
      type?: string;
      data?: { id?: string; object?: string };
    };
    const sessionId = event?.data?.id;
    if (
      !event?.type?.startsWith("checkout_session.") ||
      event?.data?.object !== "checkout_session" ||
      !sessionId
    ) {
      throw new Error("fintoc webhook: evento no manejado");
    }
    const s = await this.call<FintocSession>(
      `v2/checkout_sessions/${sessionId}`,
    );
    const refId = s.metadata?.refId;
    if (typeof refId !== "string" || !refId) {
      throw new Error(`fintoc session ${sessionId}: sin metadata.refId`);
    }
    const gatewayData = normalizeSession(s);
    if (s.status && PAID_SESSION.has(s.status)) {
      return { refId, status: "PAID", gatewayData };
    }
    if (s.status && FAILED_SESSION.has(s.status)) {
      return { refId, status: "FAILED", gatewayData };
    }
    throw new Error(
      `fintoc session ${sessionId}: estado no terminal ${s.status}`,
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
    const s = await this.call<FintocSession>(
      `v2/checkout_sessions/${ctx.gatewayRef}`,
    );
    const gatewayData = normalizeSession(s);
    if (s.status && PAID_SESSION.has(s.status)) {
      return { status: "PAID", gatewayData };
    }
    if (s.status && FAILED_SESSION.has(s.status)) {
      return { status: "FAILED", gatewayData };
    }
    return { status: "PENDING", gatewayData };
  }

  /**
   * Wrapper único de HTTP contra Fintoc (mismo patrón que Flow/MP):
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
    const method = opts.method ?? (body !== undefined ? "POST" : "GET");
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
      if (!res.ok) {
        const msg =
          typeof responseBody === "object" &&
          responseBody !== null &&
          "error" in responseBody
            ? JSON.stringify(
                (responseBody as { error: unknown }).error,
              ).slice(0, 300)
            : text.slice(0, 300);
        error = `HTTP ${res.status}: ${msg}`;
        throw new Error(`fintoc ${method} ${endpoint} → ${error}`);
      }
      ok = true;
      return responseBody as T;
    } catch (e) {
      if (!error) error = (e as Error).message;
      throw e;
    } finally {
      if (this.onTx) {
        void this.onTx({
          provider: this.name,
          direction: "OUTBOUND",
          endpoint: `${method} ${endpoint}`,
          correlationId,
          paymentId: opts.paymentId,
          httpStatus,
          durationMs: Date.now() - started,
          ok,
          error,
          requestBody: sanitizeGatewayPayload(body),
          responseBody: sanitizeGatewayPayload(responseBody),
        }).catch(() => {});
      }
    }
  }
}
