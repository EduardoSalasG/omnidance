// Espejo front de la matriz de entitlements por tier (fuente de verdad:
// apps/api/src/academies/domain/academy-tiers.ts - mantener sincronizado).
// Deriva features de `Academy.tier` (viaja en GET /academies/mine para
// owner, instructor y staff por igual) - a diferencia de
// useActorEntitlements, que solo resuelve las academias PROPIAS del owner
// y deja a staff/instructor con lista vacía. null/código desconocido →
// nivel STUDIO (misma regla que featuresForTier del API).

const COBROS = ["billing", "students"] as const;
const STUDIO = [
  ...COBROS,
  "classes",
  "attendance",
  "staff",
  "exports",
  "presales",
] as const;
const PRO = [
  ...STUDIO,
  "analytics",
  "crm",
  "videos",
  "insights",
  "multiAcademy",
] as const;

const TIER_FEATURES: Record<string, readonly string[]> = {
  COBROS,
  STARTER: STUDIO,
  STUDIO,
  PRO,
  ENTERPRISE: PRO,
};

/** ¿El tier de la academia cubre la feature? (fail-closed por omisión:
    tier desconocido → STUDIO, nunca más que eso ni menos). */
export function academyTierHas(
  tier: string | null | undefined,
  feature: string,
): boolean {
  const feats = tier == null ? STUDIO : (TIER_FEATURES[tier] ?? STUDIO);
  return feats.includes(feature);
}
