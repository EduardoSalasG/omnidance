// Puerto de dominio de entitlements por actor (spec
// unified-actor-entitlements): un solo contrato {tier, features} para
// los dos dominios de suscripción de plataforma (Producer Pro y
// Academy). Vive en payments/domain junto a platform-tiers.ts porque
// ambos tiers se proyectan desde PlatformSubscription (pagos de
// plataforma). La matriz de academia NO se duplica: los helpers de
// academies/domain/academy-tiers.ts siguen siendo su implementación
// (este módulo solo adapta el contrato de salida).
//
// El gating propiamente tal (`assertActorFeature`) vive en
// common/actor-entitlements.ts porque necesita Prisma; acá van los
// tipos, las matrices y la resolución pura.

import {
  featuresForTier as academyFeaturesForTier,
  type AcademyFeature,
} from "../../academies/domain/academy-tiers";
import { isProActive } from "./platform-tiers";

/** Actores con suscripción de plataforma gateable. */
export type ActorType = "PRODUCER" | "ACADEMY";

/** Entitlements resueltos de un actor: tier vigente + features cubiertas. */
export interface ActorEntitlement {
  tier: string | null;
  features: string[];
}

// ─── Productor ─────────────────────────────────────────────────────
// Features Producer Pro (spec producer-pro): un solo nivel efectivo
// hoy - todo Pro (tier pago o trial de lanzamiento vigente) cubre la
// lista completa. PRO_GROWTH/PRO_SCALE quedan en la matriz con las
// mismas features para cuando el spec nivele los tiers sin tocar call
// sites (cada endpoint declara su feature, no el tier nominal).

export const PRODUCER_FEATURES = [
  "analytics",
  "crm",
  "exports",
  "multiStaff",
  "campaigns",
  "benchmark",
] as const;
export type ProducerFeature = (typeof PRODUCER_FEATURES)[number];

/** Tier (código lógico) → features habilitadas del productor. */
export const PRODUCER_TIER_FEATURES: Record<
  string,
  readonly ProducerFeature[]
> = {
  PRO: PRODUCER_FEATURES,
  PRO_GROWTH: PRODUCER_FEATURES,
  PRO_SCALE: PRODUCER_FEATURES,
};

/** Orden de tiers del productor para "tier mínimo que cubre la feature". */
const PRODUCER_TIER_ORDER = ["PRO", "PRO_GROWTH", "PRO_SCALE"] as const;

/**
 * Tier efectivo del productor (spec unified-actor-entitlements): hoy
 * binario → "PRO" cuando `isProActive` (tier pago o trial vigente);
 * null si no hay Pro efectivo.
 */
export function producerEffectiveTier(
  person: { proTier: string; proTrialEndsAt: Date | null },
  now: Date = new Date(),
): string | null {
  return isProActive(person, now) ? "PRO" : null;
}

/** ¿El tier del productor cubre la feature? */
export function producerTierMeets(
  tier: string | null | undefined,
  feature: string,
): boolean {
  if (tier == null) return false;
  return (PRODUCER_TIER_FEATURES[tier] ?? []).includes(
    feature as ProducerFeature,
  );
}

/** Tier mínimo del productor que cubre la feature (para `requiredTier`). */
export function producerRequiredTierFor(feature: string): string {
  for (const tier of PRODUCER_TIER_ORDER) {
    if (PRODUCER_TIER_FEATURES[tier].includes(feature as ProducerFeature)) {
      return tier;
    }
  }
  // Feature aún no mapeada en la matriz: el piso comercial es PRO.
  return "PRO";
}

/** Entitlements del productor sobre la persona ya cargada (puro). */
export function producerEntitlement(
  person: { proTier: string; proTrialEndsAt: Date | null },
  now: Date = new Date(),
): ActorEntitlement {
  const tier = producerEffectiveTier(person, now);
  return {
    tier,
    features: tier == null ? [] : [...PRODUCER_TIER_FEATURES[tier]],
  };
}

// ─── Academia ──────────────────────────────────────────────────────
// Reusa la matriz de academies/domain/academy-tiers.ts (null → nivel
// STUDIO: el trial vende la gestión completa).

/** Entitlements de la academia ya cargada (puro). */
export function academyEntitlement(academy: {
  tier: string | null;
}): ActorEntitlement {
  return {
    tier: academy.tier,
    features: [...academyFeaturesForTier(academy.tier)],
  };
}

// ─── Común ─────────────────────────────────────────────────────────

/** Feature gateable de cualquier actor (unión de ambos dominios). */
export type ActorFeature = ProducerFeature | AcademyFeature;
