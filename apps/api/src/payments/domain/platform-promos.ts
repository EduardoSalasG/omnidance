// Promos de suscripción de plataforma (spec platform-promos): descuento
// admin-managed sobre el cargo del ciclo de una PlatformSubscription.
// Reglas fijas del dominio:
// - El descuento aplica sobre el CARGO del ciclo (lo que el plan espejo
//   cobra cada interval_count meses), no sobre el mensual base: PERCENT
//   rebate un % del cargo; FIXED_CLP descuenta un monto fijo del cargo
//   (piso $0). En ciclo mensual el cargo == el mensual.
// - Una promo NUNCA muta el plan compartido del tier: cada (promo, monto)
//   materializa su propio plan espejo. El monto va en el planId para que
//   editar el valor de la promo produzca un planId nuevo (autoconsistente
//   con el drift-check del reconcile - la sub migra al plan del monto
//   vigente al fin del período).
// - `PlatformSubscription.promoId` + `planChargeClp` registran qué plan
//   remoto tiene la sub hoy; el reconcile compara contra chargeSpec y
//   agenda `pendingReprice` cuando difieren.

import type { BillingCycle } from "@prisma/client";

/** Shape mínimo de una promo para el cálculo (evita importar el tipo Prisma). */
export interface PromoDiscount {
  discountType: "PERCENT" | "FIXED_CLP";
  percentOff: number | null;
  amountOffClp: number | null;
}

/**
 * Cargo del ciclo con el descuento aplicado. PERCENT usa percentOff
 * (0-100, piso $0); FIXED_CLP resta amountOffClp del cargo (piso $0).
 * Valores inválidos/ausentes se tratan como 0 de descuento - la API de
 * admin valida al crear, acá nunca rompemos un cobro por data mala.
 */
export function promoChargeClp(
  chargeClp: number,
  promo: PromoDiscount,
): number {
  if (promo.discountType === "PERCENT") {
    const pct = Math.min(100, Math.max(0, promo.percentOff ?? 0));
    return Math.round((chargeClp * (100 - pct)) / 100);
  }
  return Math.max(0, chargeClp - (promo.amountOffClp ?? 0));
}

/**
 * planId del plan espejo de una promo: compartido por todas las subs del
 * actor que caen en la misma (kind, tier, ciclo, promo, monto). El monto
 * va en el id porque el plan remoto hornea el precio al crearse - si la
 * promo cambia de valor el planId cambia y ensurePlan crea el correcto.
 */
export function platformPromoPlanId(
  kind: "ACADEMY" | "PRODUCER",
  tierCode: string,
  cycle: BillingCycle,
  promoId: string,
  amountClp: number,
): string {
  const scope = kind === "ACADEMY" ? "academy" : "producer";
  return `plat_${scope}_${tierCode.toLowerCase()}_${cycle.toLowerCase()}_prm_${promoId}_${amountClp}`;
}
