// Promos de membresía de academia (spec member-promos): descuento
// staff-managed sobre el cobro de un MembershipPlan, análogo a las
// PlatformPromo de las suscripciones de plataforma (platform-promos.ts).
// Reglas fijas del dominio:
// - El descuento aplica sobre el PRECIO del plan (MembershipPlan.price):
//   PERCENT rebate un % (piso $0); FIXED_CLP descuenta un monto fijo
//   (piso $0). Una promo NUNCA muta el precio del plan.
// - En cobro recurrente el descuento se materializa como plan espejo
//   propio por (plan, promo, monto): el monto va en el planId para que
//   editar el valor de la promo produzca un planId nuevo
//   (autoconsistente con el drift-check del reconcile - la sub migra al
//   plan del monto vigente al fin del período).
// - `MembershipSubscription.academyPromoId` + `planChargeClp` registran
//   qué plan remoto tiene la sub hoy; el reconcile compara contra la
//   resolución vigente y agenda `pendingReprice` cuando difieren.

import { promoChargeClp, type PromoDiscount } from "./platform-promos";

// El cálculo del descuento es exactamente el mismo que en promos de
// plataforma - se reutiliza la función compartida.
export { promoChargeClp };
export type { PromoDiscount };

/** planId del espejo base de un MembershipPlan (sin promo). */
export function membershipBasePlanId(planId: string): string {
  return `omni_${planId}`;
}

/**
 * planId del plan espejo de una promo de academia: compartido por todas
 * las subs del plan que caen en la misma (promo, monto). El monto va en
 * el id porque el plan remoto hornea el precio al crearse - si la promo
 * cambia de valor el planId cambia y ensurePlan crea el correcto.
 */
export function academyPromoPlanId(
  planId: string,
  promoId: string,
  amountClp: number,
): string {
  return `omni_${planId}_prm_${promoId}_${amountClp}`;
}
