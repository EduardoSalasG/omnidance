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

// Corte unificado (spec platform-trials, espejo de
// academies/domain/academy-tiers.ts del API): `tier == null` ya no es
// "trial infinito" - depende del trial. Sin suscripción vigente:
// trialEndsAt futuro → STUDIO; pasado o null → features vacías y la
// consola queda en Inicio/Suscripción/Perfil.

export type AcademyTrialShape = {
  tier?: string | null;
  trialEndsAt?: string | Date | null;
};

/** Trial vigente: sin tier y con fin de trial en el futuro. */
export function academyInTrial(
  academy: AcademyTrialShape,
  now: Date = new Date(),
): boolean {
  if (academy.tier != null || academy.trialEndsAt == null) return false;
  return new Date(academy.trialEndsAt).getTime() > now.getTime();
}

/** Sin acceso por falta de suscripción y trial (vencido o inexistente). */
export function academyTrialExpired(
  academy: AcademyTrialShape,
  now: Date = new Date(),
): boolean {
  return academy.tier == null && !academyInTrial(academy, now);
}

/** ¿La academia tiene la feature? Tier contratado manda; sin tier el
    trial vigente da STUDIO y el vencido da nada. */
export function academyHasFeature(
  academy: AcademyTrialShape,
  feature: string,
): boolean {
  if (academyTrialExpired(academy)) return false;
  return academyTierHas(academy.tier, feature);
}
