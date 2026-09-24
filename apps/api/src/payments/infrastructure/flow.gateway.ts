import { Injectable } from "@nestjs/common";
import { createHmac } from "node:crypto";
import type { PaymentGateway } from "../domain/ports";

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
@Injectable()
export class FlowGateway implements PaymentGateway {
  readonly name = "FLOW";

  constructor(
    private readonly apiKey: string,
    private readonly secret: string,
    private readonly baseUrl = "https://sandbox.flow.cl/api",
    private readonly confirmationUrl = "",
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
    const body = this.signedParams(params);
    const res = await fetch(`${this.baseUrl}/payment/create`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      throw new Error(
        `flow createOrder HTTP ${res.status}: ${await this.errorDetail(res)}`,
      );
    }
    const data = (await res.json()) as {
      url?: string;
      token?: string;
      flowOrder?: number;
    };
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
    const params = this.signedParams({ apiKey: this.apiKey, token: b.token });
    const res = await fetch(
      `${this.baseUrl}/payment/getStatus?${params.toString()}`,
      { signal: AbortSignal.timeout(10_000) },
    );
    if (!res.ok) {
      throw new Error(
        `flow getStatus HTTP ${res.status}: ${await this.errorDetail(res)}`,
      );
    }
    const data = (await res.json()) as {
      status?: number;
      commerceOrder?: string;
    };
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
    const params = this.signedParams({
      apiKey: this.apiKey,
      commerceOrder: refId,
    });
    const res = await fetch(
      `${this.baseUrl}/payment/getStatusByCommerceId?${params.toString()}`,
      { signal: AbortSignal.timeout(10_000) },
    );
    if (!res.ok) {
      throw new Error(
        `flow getStatusByCommerceId HTTP ${res.status}: ${await this.errorDetail(res)}`,
      );
    }
    const data = (await res.json()) as { status?: number };
    if (data.status === 2) return "PAID";
    if (data.status === 3 || data.status === 4) return "FAILED";
    return "PENDING";
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

  // Flow responde {code, message} en errores — el message es seguro de
  // loggear (no incluye credenciales ni firmas). Truncado por sanidad.
  private async errorDetail(res: Response): Promise<string> {
    try {
      const data = (await res.json()) as { code?: number; message?: string };
      return data.message ? `${data.code ?? ""} ${data.message}`.trim() : "";
    } catch {
      return "";
    }
  }
}
