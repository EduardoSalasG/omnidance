import { Injectable } from "@nestjs/common";
import { createHmac, randomUUID } from "node:crypto";
import type {
  FlowSubscription,
  PaymentGateway,
  SubscriptionCallOpts,
  SubscriptionProvider,
} from "../domain/ports";
import {
  sanitizeGatewayPayload,
  type GatewayTxEntry,
} from "./gateway-transactions.service";

// Flow (https://developers.flow.cl/api): firma HMAC-SHA256 sobre los
// parámetros ordenados alfabéticamente concatenados como "nombreValor",
// con el secretKey — se agrega como param "s".
//
// Ambientes: producción https://www.flow.cl/api · sandbox
// https://sandbox.flow.cl/api (credenciales propias, sandbox.flow.cl →
// Mis datos → Integraciones). FLOW_BASE_URL selecciona el ambiente.
//
// El módulo solo instancia este adapter cuando PAYMENT_GATEWAY=flow y
// existen FLOW_API_KEY + FLOW_SECRET(_KEY); en otro caso usa StubGateway.
//
// TODA llamada HTTP a Flow pasa por call(), que emite un GatewayTxEntry
// (append-only) vía onTx — el writer real es GatewayTransactionsService,
// inyectado desde el módulo; en tests se inyecta un collector fake.
// Re-export de los tipos del contrato para callers del adapter.
export type { FlowInvoice, FlowSubscription } from "../domain/ports";

@Injectable()
export class FlowGateway implements PaymentGateway, SubscriptionProvider {
  readonly name = "FLOW";

  constructor(
    private readonly apiKey: string,
    private readonly secret: string,
    private readonly baseUrl = "https://sandbox.flow.cl/api",
    private readonly confirmationUrl = "",
    private readonly onTx?: (e: GatewayTxEntry) => Promise<void>,
    // urlCallback que Flow invoca ante eventos del plan/suscripción
    // (plans/create lo registra por plan). Lo arma el module:
    // `${API_URL}/api/payments/subscription-webhook`.
    private readonly subscriptionCallbackUrl = "",
  ) {}

  async createOrder(p: {
    refId: string;
    amount: number;
    email: string;
    returnUrl: string;
  }): Promise<{ paymentUrl: string; gatewayRef: string }> {
    const params: Record<string, string> = {
      apiKey: this.apiKey,
      commerceOrder: p.refId,
      // El refId codifica el tipo de orden (tkt_/sp_/mem_) — el subject
      // del checkout de Flow refleja qué se está comprando.
      subject: p.refId.startsWith("mem_")
        ? "Plan Omnidance"
        : p.refId.startsWith("sp_")
          ? "Pase de serie Omnidance"
          : "Ticket Omnidance",
      currency: "CLP",
      amount: String(p.amount),
      email: p.email,
      urlConfirmation: this.confirmationUrl,
      urlReturn: p.returnUrl,
    };
    const data = await this.call<{
      url?: string;
      token?: string;
      flowOrder?: number;
    }>("payment/create", params);
    if (!data.url || !data.token) {
      throw new Error("flow createOrder: respuesta inválida");
    }
    return {
      paymentUrl: `${data.url}?token=${data.token}`,
      gatewayRef: String(data.flowOrder ?? data.token),
    };
  }

  // Flow notifica { token }; hay que consultar payment/getStatus para
  // confirmar (status: 1 pendiente, 2 pagado, 3 rechazado, 4 anulado).
  async verifyWebhook(body: unknown): Promise<{
    refId: string;
    status: "PAID" | "FAILED";
    gatewayData?: unknown;
  }> {
    const b = body as { token?: unknown } | null;
    if (!b || typeof b.token !== "string") {
      throw new Error("webhook flow inválido");
    }
    const data = await this.call<{
      status?: number;
      commerceOrder?: string;
      // paymentData {fee, amount, media, transferDate, …} — verdad
      // monetaria del cobro; el settle la persiste en Payment.gateway*.
      paymentData?: Record<string, unknown>;
    }>(
      "payment/getStatus",
      { apiKey: this.apiKey, token: b.token },
      { method: "GET" },
    );
    if (!data.commerceOrder) throw new Error("flow getStatus: sin orden");
    if (data.status === 2) {
      return {
        refId: data.commerceOrder,
        status: "PAID",
        gatewayData: data.paymentData,
      };
    }
    if (data.status === 3 || data.status === 4) {
      return {
        refId: data.commerceOrder,
        status: "FAILED",
        gatewayData: data.paymentData,
      };
    }
    throw new Error(`flow getStatus: estado no terminal ${data.status}`);
  }

  /**
   * Consulta activa por commerceOrder (= nuestro refId). La usa el
   * polling de GET /payments/:id cuando la orden sigue PENDING — cubre
   * sandbox/dev donde el urlConfirmation de Flow no llega a localhost.
   * Estados Flow: 1 pendiente · 2 pagado · 3 rechazado · 4 anulado.
   */
  async refreshStatus(refId: string): Promise<"PAID" | "FAILED" | "PENDING"> {
    const data = await this.call<{ status?: number }>(
      "payment/getStatusByCommerceId",
      { apiKey: this.apiKey, commerceOrder: refId },
      { method: "GET" },
    );
    if (data.status === 2) return "PAID";
    if (data.status === 3 || data.status === 4) return "FAILED";
    return "PENDING";
  }

  // ---------- Suscripciones (SubscriptionProvider) ----------
  // Motor nativo de Flow: el plan define el cobro recurrente
  // (interval=3 mensual, interval_count = cada cuántos meses cobra:
  // 1 mensual · 3 trimestral · 6 semestral según PlanType), el customer
  // registra su tarjeta vía customer/register y la suscripción se crea
  // con subscription/create. Todos pasan por call() → auditados.

  /**
   * plans/get → si Flow responde error (incl. plan inexistente) →
   * plans/create. Idempotente: un plan ya creado no se duplica.
   * urlCallback = webhook de suscripciones (lo arma el module).
   */
  async ensurePlan(
    p: {
      planId: string;
      name: string;
      amount: number;
      intervalCount: number;
    },
    opts?: SubscriptionCallOpts,
  ): Promise<void> {
    try {
      await this.call<unknown>(
        "plans/get",
        { apiKey: this.apiKey, planId: p.planId },
        { method: "GET", correlationId: opts?.correlationId },
      );
      return; // ya existe en Flow — no duplicar
    } catch {
      // plans/get falló (404/error) → crear abajo.
    }
    if (!this.subscriptionCallbackUrl) {
      throw new Error(
        "FlowGateway: subscriptionCallbackUrl no configurada — plans/create sin urlCallback dejaría la suscripción sin notificación de cobros",
      );
    }
    await this.call<unknown>(
      "plans/create",
      {
        apiKey: this.apiKey,
        planId: p.planId,
        name: p.name,
        currency: "CLP",
        amount: String(p.amount),
        interval: "3",
        interval_count: String(p.intervalCount),
        urlCallback: this.subscriptionCallbackUrl,
        charges_retries_number: "3",
      },
      { correlationId: opts?.correlationId },
    );
  }

  /** plans/edit — sync cuando staff edita precio/nombre del plan local. */
  async syncPlan(
    p: { planId: string; name: string; amount: number },
    opts?: SubscriptionCallOpts,
  ): Promise<void> {
    await this.call<unknown>(
      "plans/edit",
      {
        apiKey: this.apiKey,
        planId: p.planId,
        name: p.name,
        amount: String(p.amount),
      },
      { correlationId: opts?.correlationId },
    );
  }

  async createCustomer(
    p: { email: string; name: string; externalId: string },
    opts?: SubscriptionCallOpts,
  ): Promise<{ customerId: string }> {
    const data = await this.call<{ customerId?: string }>(
      "customer/create",
      {
        apiKey: this.apiKey,
        email: p.email,
        name: p.name,
        externalId: p.externalId,
      },
      { correlationId: opts?.correlationId },
    );
    if (!data.customerId) {
      throw new Error("flow customer/create: respuesta inválida");
    }
    return { customerId: data.customerId };
  }

  /**
   * customer/get — `creditCardType` presente = el customer ya registró
   * tarjeta (completó customer/register); si falta, hay que mandarlo al
   * disclaimer de Flow antes de crear la suscripción.
   */
  async getCustomer(
    customerId: string,
    opts?: SubscriptionCallOpts,
  ): Promise<{ creditCardType?: string; status?: number }> {
    const data = await this.call<{
      creditCardType?: string;
      status?: number;
    }>(
      "customer/get",
      { apiKey: this.apiKey, customerId },
      { method: "GET", correlationId: opts?.correlationId },
    );
    return { creditCardType: data.creditCardType, status: data.status };
  }

  /**
   * customer/register → URL del disclaimer de registro de tarjeta
   * (registerUrl = url?token=). El usuario vuelve a returnUrl con
   * ?token=, que se consulta vía getRegisterStatus.
   */
  async registerCustomerCard(
    p: { customerId: string; returnUrl: string },
    opts?: SubscriptionCallOpts,
  ): Promise<{ registerUrl: string }> {
    const data = await this.call<{ url?: string; token?: string }>(
      "customer/register",
      {
        apiKey: this.apiKey,
        customerId: p.customerId,
        url_return: p.returnUrl,
      },
      { correlationId: opts?.correlationId },
    );
    if (!data.url || !data.token) {
      throw new Error("flow customer/register: respuesta inválida");
    }
    return { registerUrl: `${data.url}?token=${data.token}` };
  }

  /**
   * customer/getRegisterStatus — Flow devuelve status como STRING
   * ("1" = tarjeta registrada); se parsea a number en la salida.
   */
  async getRegisterStatus(
    token: string,
    opts?: SubscriptionCallOpts,
  ): Promise<{ status: number; customerId?: string }> {
    const data = await this.call<{
      status?: string | number;
      customerId?: string;
    }>(
      "customer/getRegisterStatus",
      { apiKey: this.apiKey, token },
      { method: "GET", correlationId: opts?.correlationId },
    );
    return {
      status: Number(data.status ?? 0),
      customerId: data.customerId,
    };
  }

  /**
   * subscription/create — subscriptionStart "YYYY-MM-DD" fija el inicio
   * (Flow cobra el primer período y programa next_invoice_date).
   */
  async createSubscription(
    p: { planId: string; customerId: string; subscriptionStart: string },
    opts?: SubscriptionCallOpts,
  ): Promise<FlowSubscription> {
    const data = await this.call<FlowSubscription>(
      "subscription/create",
      {
        apiKey: this.apiKey,
        planId: p.planId,
        customerId: p.customerId,
        subscription_start: p.subscriptionStart,
      },
      { correlationId: opts?.correlationId },
    );
    if (!data.subscriptionId) {
      throw new Error("flow subscription/create: respuesta inválida");
    }
    return data;
  }

  /**
   * subscription/get — fuente de verdad del reconcile diario: trae
   * invoices[] con su estado de cobro (ver isFlowInvoicePaid).
   */
  async getSubscription(
    subscriptionId: string,
    opts?: SubscriptionCallOpts,
  ): Promise<FlowSubscription> {
    return this.call<FlowSubscription>(
      "subscription/get",
      { apiKey: this.apiKey, subscriptionId },
      { method: "GET", correlationId: opts?.correlationId },
    );
  }

  /** Cancela al fin del período ya pagado (at_period_end=1). */
  async cancelSubscription(
    subscriptionId: string,
    opts?: SubscriptionCallOpts,
  ): Promise<void> {
    await this.call<unknown>(
      "subscription/cancel",
      {
        apiKey: this.apiKey,
        subscriptionId,
        at_period_end: "1",
      },
      { correlationId: opts?.correlationId },
    );
  }

  /**
   * Wrapper único de HTTP contra Flow: firma los params, ejecuta el fetch
   * (POST urlencoded por default; GET lleva los params firmados en la
   * querystring) y SIEMPRE emite un GatewayTxEntry en el finally — éxito,
   * error HTTP o falla de red quedan auditados con durationMs y detalle.
   * La firma viaja sanitizada (sha256 truncado) en requestBody: la raw
   * signature nunca sale del boundary del fetch.
   */
  private async call<T>(
    endpoint: string,
    params: Record<string, string>,
    opts: {
      method?: "GET" | "POST";
      correlationId?: string;
      paymentId?: string;
      timeoutMs?: number;
    } = {},
  ): Promise<T> {
    const method = opts.method ?? "POST";
    const correlationId = opts.correlationId ?? randomUUID();
    const signed = this.signedParams(params);
    const started = Date.now();
    let httpStatus: number | undefined;
    let responseBody: unknown;
    let ok = false;
    let error: string | undefined;
    try {
      const url =
        method === "GET"
          ? `${this.baseUrl}/${endpoint}?${signed.toString()}`
          : `${this.baseUrl}/${endpoint}`;
      const res = await fetch(url, {
        method,
        headers:
          method === "POST"
            ? { "content-type": "application/x-www-form-urlencoded" }
            : undefined,
        body: method === "POST" ? signed : undefined,
        // Timeout unificado 15s (create era 15s, status 10s — la
        // auditoría favorece no cortar una consulta que sí respondería).
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
        // Flow responde {code, message} en errores — el message es seguro
        // de loggear (no incluye credenciales ni firmas).
        const detail = (
          responseBody as { code?: number; message?: string } | null
        )?.message;
        throw new Error(
          `flow ${endpoint} HTTP ${res.status}${detail ? `: ${detail}` : ""}`,
        );
      }
      return responseBody as T;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      throw e;
    } finally {
      try {
        await this.onTx?.({
          provider: "FLOW",
          direction: "OUTBOUND",
          endpoint,
          correlationId,
          requestBody: sanitizeGatewayPayload(
            Object.fromEntries(signed.entries()),
          ),
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

  // Ordena params por clave, concatena "claveValor" y firma con HMAC-SHA256.
  private signedParams(params: Record<string, string>): URLSearchParams {
    const ordered = Object.keys(params)
      .sort()
      .map((k) => `${k}${params[k]}`)
      .join("");
    const s = createHmac("sha256", this.secret).update(ordered).digest("hex");
    const qs = new URLSearchParams(params);
    qs.set("s", s);
    return qs;
  }
}
