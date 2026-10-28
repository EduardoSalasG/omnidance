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
// Features Producer Pro (spec producer-pro): matriz acumulativa por
// tier - PRO_STARTER vende analítica + exports + staff (cupo 1),
// PRO_GROWTH suma el CRM (cupo 2) y PRO_BIG lo habilita todo (staff
// ilimitado). Cada endpoint declara su feature; el tier efectivo es el
// tierCode real del Pro vigente.

export const PRODUCER_FEATURES = [
  "analytics",
  "crm",
  "exports",
  "multiStaff",
  "campaigns",
  "benchmark",
] as const;
export type ProducerFeature = (typeof PRODUCER_FEATURES)[number];

const PRO_STARTER_FEATURES = [
  "analytics",
  "exports",
  "multiStaff",
] as const satisfies readonly ProducerFeature[];

/** Tier (código del enum ProducerProTier) → features habilitadas. */
export const PRODUCER_TIER_FEATURES: Record<
  string,
  readonly ProducerFeature[]
> = {
  PRO_STARTER: PRO_STARTER_FEATURES,
  PRO_GROWTH: [...PRO_STARTER_FEATURES, "crm"],
  PRO_BIG: PRODUCER_FEATURES,
};

/** Orden de tiers del productor para "tier mínimo que cubre la feature". */
const PRODUCER_TIER_ORDER = ["PRO_STARTER", "PRO_GROWTH", "PRO_BIG"] as const;

/**
 * Cupo de la nómina de colaboradores por tier (spec producer-pro):
 * staff pasa de booleano a tope numérico - PRO_BIG no tiene entrada
 * (sin cupo). Sin tier efectivo tampoco hay entrada: el alta ya quedó
 * bloqueada por el gate de `multiStaff`.
 */
export const PRODUCER_TIER_STAFF_LIMIT: Record<string, number> = {
  // PRO_STARTER legado y FREE comparten el cupo de la norma operativa
  // (1-2 personas en puerta); el diferenciador pago es ilimitado (BIG).
  PRO_STARTER: 2,
  PRO_GROWTH: 2,
};

/**
 * Tier efectivo del productor (spec unified-actor-entitlements +
 * producer-pro): el `tierCode` real del Pro vigente
 * (Person.proTier lo proyecta la PlatformSubscription vía
 * applyEntitlement/settlePlatformSub).
 *
 * Trial de lanzamiento (proTier FREE + proTrialEndsAt vigente) →
 * PRO_STARTER: el trial vende el piso Pro (analytics + exports +
 * staff ≤1), no el tope de la matriz. Decisión del change
 * producer-pro-tiers: documentada acá porque proTrialEndsAt no guarda
 * tier - el trial nunca tuvo tierCode propio.
 */
export function producerEffectiveTier(
  person: { proTier: string; proTrialEndsAt: Date | null },
  now: Date = new Date(),
): string | null {
  if (!isProActive(person, now)) return null;
  if (person.proTier === "FREE") return "PRO_STARTER"; // trial vigente
  return person.proTier;
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
  // Feature aún no mapeada en la matriz: el piso comercial es PRO_STARTER.
  return "PRO_STARTER";
}

/** Entitlements del productor sobre la persona ya cargada (puro). */
export function producerEntitlement(
  person: { proTier: string; proTrialEndsAt: Date | null },
  now: Date = new Date(),
): ActorEntitlement {
  const tier = producerEffectiveTier(person, now);
  return {
    tier,
    // Código no mapeado en la matriz → [] (fail-closed, nunca TypeError).
    features: tier == null ? [] : [...(PRODUCER_TIER_FEATURES[tier] ?? [])],
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
