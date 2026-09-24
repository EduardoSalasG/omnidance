import { Injectable } from "@nestjs/common";
import { createHmac, randomUUID } from "node:crypto";
import type { PaymentGateway } from "../domain/ports";
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
@Injectable()
export class FlowGateway implements PaymentGateway {
  readonly name = "FLOW";

  constructor(
    private readonly apiKey: string,
    private readonly secret: string,
    private readonly baseUrl = "https://sandbox.flow.cl/api",
    private readonly confirmationUrl = "",
    private readonly onTx?: (e: GatewayTxEntry) => Promise<void>,
    // Reservado para suscripciones (task 4): urlCallback de
    // subscription/create. Se declara ya para estabilizar la firma.
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
  }> {
    const b = body as { token?: unknown } | null;
    if (!b || typeof b.token !== "string") {
      throw new Error("webhook flow inválido");
    }
    const data = await this.call<{
      status?: number;
      commerceOrder?: string;
    }>(
      "payment/getStatus",
      { apiKey: this.apiKey, token: b.token },
      { method: "GET" },
    );
    if (!data.commerceOrder) throw new Error("flow getStatus: sin orden");
    if (data.status === 2) {
      return { refId: data.commerceOrder, status: "PAID" };
    }
    if (data.status === 3 || data.status === 4) {
      return { refId: data.commerceOrder, status: "FAILED" };
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
