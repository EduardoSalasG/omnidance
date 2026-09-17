import { Injectable } from "@nestjs/common";
import type { PaymentGateway } from "../domain/ports";

// Gateway de desarrollo: no sale a ninguna red; el webhook acepta
// { refId, status: "PAID" | "FAILED" } tal cual para simular la pasarela.
@Injectable()
export class StubGateway implements PaymentGateway {
  readonly name = "STUB";

  createOrder(p: { refId: string }): Promise<{
    paymentUrl: string;
    gatewayRef: string;
  }> {
    return Promise.resolve({
      paymentUrl: `stub://pay/${p.refId}`,
      gatewayRef: `stub-${p.refId}`,
    });
  }

  verifyWebhook(body: unknown): Promise<{
    refId: string;
    status: "PAID" | "FAILED";
  }> {
    const b = body as { refId?: unknown; status?: unknown } | null;
    if (
      !b ||
      typeof b.refId !== "string" ||
      (b.status !== "PAID" && b.status !== "FAILED")
    ) {
      throw new Error("webhook stub inválido");
    }
    return Promise.resolve({ refId: b.refId, status: b.status });
  }
}
