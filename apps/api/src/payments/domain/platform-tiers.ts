// Catálogo de tiers de la suscripción de plataforma (spec
// academy-saas-billing). `PlatformSubscription.tierCode` es String porque
// una tabla cubre dos dominios; estos sets/ranks validan y ordenan.
// Precios y límites viven en PlatformParam (academy_tier.*, producer_tier.*).

import type { AcademyTier, BillingCycle, ProducerProTier } from "@prisma/client";

/** Tiers válidos por dominio. */
export const ACADEMY_TIERS = new Set<string>([
  "STARTER",
  "PRO",
  "STUDIO",
  "ENTERPRISE",
]);
export const PRODUCER_PRO_TIERS = new Set<string>([
  "PRO_STARTER",
  "PRO_GROWTH",
  "PRO_BIG",
]);

/** Tiers auto-contratables - ENTERPRISE/PRO_BIG son "a convenir" (manual). */
export const SELF_SERVE_ACADEMY_TIERS = new Set<string>([
  "STARTER",
  "PRO",
  "STUDIO",
]);
export const SELF_SERVE_PRODUCER_TIERS = new Set<string>([
  "PRO_STARTER",
  "PRO_GROWTH",
]);

/** Ranking para decidir upgrade (aplica ya) vs downgrade (próximo ciclo). */
export const ACADEMY_TIER_RANK: Record<AcademyTier, number> = {
  STARTER: 0,
  PRO: 1,
  STUDIO: 2,
  ENTERPRISE: 3,
};
export const PRODUCER_TIER_RANK: Record<ProducerProTier, number> = {
  FREE: -1,
  PRO_STARTER: 0,
  PRO_GROWTH: 1,
  PRO_BIG: 2,
};

/**
 * BillingCycle → meses entre cobros. Los planes Flow usan interval=3
 * (mensual) con interval_count = meses del ciclo - el cobro es
 * mensual-equivalente × meses (semestral −2% / anual −4% ya vienen en el
 * param del ciclo).
 */
export const CYCLE_MONTHS: Record<BillingCycle, number> = {
  MONTHLY: 1,
  SEMIANNUAL: 6,
  ANNUAL: 12,
};

export const CYCLE_LABEL: Record<BillingCycle, string> = {
  MONTHLY: "mensual",
  SEMIANNUAL: "semestral",
  ANNUAL: "anual",
};

/** `producer_tier.<key>_*_clp` - key del tier Pro en PlatformParam. */
export function producerTierParamKey(tierCode: string): string | null {
  if (tierCode === "PRO_STARTER") return "starter";
  if (tierCode === "PRO_GROWTH") return "growth";
  return null; // FREE/PRO_BIG no tienen precio autogestionado
}

/**
 * ¿El productor tiene Pro efectivo? (spec producer-pro, S5): tier Pro
 * vigente (`proTier !== "FREE"`, proyectado desde la PlatformSubscription
 * por el settle) **o** trial de lanzamiento vigente (`proTrialEndsAt`,
 * backfill +90d a productores registrados en la migración). FREE sin
 * trial → features Pro bloqueadas con `pro.required`.
 */
export function isProActive(
  person: { proTier: string; proTrialEndsAt: Date | null },
  now: Date = new Date(),
): boolean {
  return (
    person.proTier !== "FREE" ||
    (person.proTrialEndsAt != null && person.proTrialEndsAt > now)
  );
}

/** planId del plan espejo Flow - compartido por todas las subs del tier. */
export function platformPlanId(
  kind: "ACADEMY" | "PRODUCER",
  tierCode: string,
  cycle: BillingCycle,
): string {
  const scope = kind === "ACADEMY" ? "academy" : "producer";
  return `plat_${scope}_${tierCode.toLowerCase()}_${cycle.toLowerCase()}`;
}
