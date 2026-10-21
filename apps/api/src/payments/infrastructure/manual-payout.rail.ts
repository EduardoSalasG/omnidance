import {
  PayoutRequiresManualError,
  type PayoutRail,
} from "../domain/payout-rail";

// Rail MANUAL (spec payouts/payout-rails): placeholder para que la
// resolución actor→rail nunca devuelva vacío. No hay desembolso
// implícito - disburse siempre rechaza con PAYOUT_REQUIRES_MANUAL y el
// admin usa `POST /admin/payouts/:id/pay` + evidenceUrl (flujo chileno
// vigente). La resolución cae aquí cuando el actor no tiene
// PayoutDestination ACTIVE en la moneda del payout (o Stripe no está
// configurado).
export class ManualPayoutRail implements PayoutRail {
  readonly name = "MANUAL";

  disburse(
    _p: Parameters<PayoutRail["disburse"]>[0],
  ): Promise<{ ref: string }> {
    return Promise.reject(new PayoutRequiresManualError());
  }
}
