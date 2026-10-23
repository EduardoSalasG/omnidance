// Matriz de entitlements por tier de academia (spec academy-tier-cobros,
// omni-dance.md §10). El tier vigente vive en `Academy.tier` (proyección de
// la PlatformSubscription vía applyEntitlement): null = trial, gracia o
// sin suscripción.
//
// Mapeo de códigos (el enum AcademyTier conserva los valores legacy - no
// se editan migraciones aplicadas ni filas de suscripción):
// - COBROS     → cobranza pura: cobro de membresías por nuestra pasarela +
//                lista de alumnos al día/morosos.
// - STARTER    → legado pre-reestructura: sube a nivel STUDIO (las cuentas
//                existentes quedan STUDIO por defecto - nadie baja a
//                COBROS). Ya no es auto-contratable.
// - STUDIO     → operación completa: clases/series, reservas, asistencia,
//                staff, preventas y exports.
// - PRO        → + analítica, CRM, campañas marketing, videos, insights y
//                cuenta multi-academia.
// - ENTERPRISE → a convenir: nivel PRO.
// - null       → trial/gracia/sin suscripción: nivel STUDIO (la prueba es
//                de la gestión completa; el upsell queda en PRO).

import { ForbiddenException } from "@nestjs/common";

/** Features gateables de la consola de academia. */
export const ACADEMY_FEATURES = [
  // Base (COBROS): cobranza + estado de alumnos - no se gatean en
  // endpoints porque son el piso de la consola.
  "billing",
  "students",
  // STUDIO: operación completa.
  "classes",
  "attendance",
  "staff",
  "exports",
  "presales",
  // PRO: inteligencia y marketing.
  "analytics",
  "crm",
  "videos",
  "insights",
  "multiAcademy",
] as const;
export type AcademyFeature = (typeof ACADEMY_FEATURES)[number];

const COBROS_FEATURES: readonly AcademyFeature[] = ["billing", "students"];

const STUDIO_FEATURES: readonly AcademyFeature[] = [
  ...COBROS_FEATURES,
  "classes",
  "attendance",
  "staff",
  "exports",
  "presales",
];

const PRO_FEATURES: readonly AcademyFeature[] = [
  ...STUDIO_FEATURES,
  "analytics",
  "crm",
  "videos",
  "insights",
  "multiAcademy",
];

/**
 * Tier (código persistido) → features habilitadas. Los códigos legacy se
 * resuelven al nivel nuevo equivalente - "cuentas existentes quedan STUDIO
 * por defecto" de la spec.
 */
export const TIER_FEATURES: Record<string, readonly AcademyFeature[]> = {
  COBROS: COBROS_FEATURES,
  STARTER: STUDIO_FEATURES,
  STUDIO: STUDIO_FEATURES,
  PRO: PRO_FEATURES,
  ENTERPRISE: PRO_FEATURES,
};

/**
 * Features efectivas de una academia. null (trial/gracia/sin sub) y
 * códigos desconocidos resuelven a STUDIO: el trial vende la gestión
 * completa y el default de transición es STUDIO, nunca menos.
 */
export function featuresForTier(
  tier: string | null | undefined,
): readonly AcademyFeature[] {
  if (tier == null) return STUDIO_FEATURES;
  return TIER_FEATURES[tier] ?? STUDIO_FEATURES;
}

/** ¿La academia tiene la feature habilitada por su tier? */
export function tierMeets(
  tier: string | null | undefined,
  feature: AcademyFeature,
): boolean {
  return featuresForTier(tier).includes(feature);
}

/** Tier mínimo que habilita la feature (para `requiredTier` del 403). */
export function requiredTierFor(
  feature: AcademyFeature,
): "COBROS" | "STUDIO" | "PRO" {
  if (COBROS_FEATURES.includes(feature)) return "COBROS";
  if (STUDIO_FEATURES.includes(feature)) return "STUDIO";
  return "PRO";
}

/**
 * Gate de consola por tier (mismo patrón que `pro.required` de
 * producer-pro): 403 `{error:"tier.required", upgrade:true, requiredTier}`
 * - el front muestra el estado "parte del plan X" con CTA a
 * /academia/suscripcion. Trabaja sobre la academia ya cargada (sin query
 * extra); el bypass de ADMIN queda en el caller (AcademyAccess).
 */
export function assertAcademyFeature(
  academy: { tier: string | null },
  feature: AcademyFeature,
): void {
  if (tierMeets(academy.tier, feature)) return;
  const requiredTier = requiredTierFor(feature);
  throw new ForbiddenException({
    error: "tier.required",
    upgrade: true,
    requiredTier,
    feature,
    message: `esta herramienta es parte del plan ${requiredTier} - sube de tier para seguir usándola`,
  });
}
