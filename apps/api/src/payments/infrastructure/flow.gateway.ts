import { Injectable } from "@nestjs/common";
import { createHmac } from "node:crypto";
import type { PaymentGateway } from "../domain/ports";

// Flow (https://www.flow.cl/api): firma HMAC-SHA256 sobre los parámetros
// ordenados alfabéticamente concatenados como "nombreValor", con el secretKey.
// Docs: https://www.flow.cl/docs/api.html
//
// El módulo solo instancia este adapter cuando PAYMENT_GATEWAY=flow y existen
// FLOW_API_KEY + FLOW_SECRET(_KEY); en otro caso usa StubGateway.
@Injectable()
export class FlowGateway implements PaymentGateway {
  readonly name = "FLOW";

  constructor(
    private readonly apiKey: string,
    private readonly secret: string,
    private readonly baseUrl = "https://www.flow.cl/api",
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
      subject: "Ticket Omnidance",
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
    });
    if (!res.ok) throw new Error(`flow createOrder HTTP ${res.status}`);
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
    );
    if (!res.ok) throw new Error(`flow getStatus HTTP ${res.status}`);
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
