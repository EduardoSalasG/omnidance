// Puerto de pasarela de pago (hexagonal) — el dominio no conoce Flow ni el stub.
export const PAYMENT_GATEWAY = "PAYMENT_GATEWAY";

export interface PaymentGateway {
  /** Identificador persistido en Payment.gateway (STUB | FLOW). */
  readonly name: string;

  createOrder(p: {
    refId: string;
    amount: number;
    email: string;
    returnUrl: string;
  }): Promise<{ paymentUrl: string; gatewayRef: string }>;

  verifyWebhook(body: unknown): Promise<{
    refId: string;
    status: "PAID" | "FAILED";
  }>;
}
