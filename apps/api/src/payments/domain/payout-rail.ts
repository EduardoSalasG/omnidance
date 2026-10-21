// Puerto de rail de desembolso (spec payouts/payout-rails, change
// stripe-gateway-payout-rail): el dominio no conoce Stripe ni el
// banco - el desembolso de un Payout APPROVED se abstrae tras este
// port. Implementaciones: ManualPayoutRail (rechaza siempre - el pago
// manual con evidenceUrl es un flujo aparte, nunca implícito) y
// StripeConnectPayoutRail (POST /v1/transfers a la cuenta Connect del
// actor).

/**
 * El rail no puede desembolsar automáticamente: el admin debe usar
 * `POST /admin/payouts/:id/pay` con evidenceUrl (flujo chileno vigente).
 * El controller lo traduce a 409 {message:"requiresManualEvidence"}.
 */
export class PayoutRequiresManualError extends Error {
  readonly code = "PAYOUT_REQUIRES_MANUAL";

  constructor(message = "el payout requiere desembolso manual con evidencia") {
    super(message);
    this.name = "PayoutRequiresManualError";
  }
}

export interface PayoutRail {
  /** Identificador persistido en Payout.rail ("MANUAL" | "STRIPE_CONNECT"). */
  readonly name: string;

  /**
   * Ejecuta el desembolso del payout hacia la ref del rail del actor.
   * Devuelve la ref remota persistida en Payout.railRef (tr_…).
   *
   * - amount: unidad mayor, entero (CLP 5000 = 5000; USD 25 = 25).
   * - currency: ISO 4217 del Payout - la conversión a minor units es
   *   responsabilidad del adaptador.
   * - destinationRef: ref del rail en el PayoutDestination (acct_…).
   * - payoutId: clave de idempotencia del proveedor
   *   (Idempotency-Key: payout:<id>) - un reintento tras timeout nunca
   *   duplica la transferencia.
   */
  disburse(p: {
    payoutId: string;
    amount: number;
    currency: string;
    destinationRef: string;
  }): Promise<{ ref: string }>;
}
