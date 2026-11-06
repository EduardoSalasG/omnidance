"use client";

import { TierPaywall } from "@/components/tier-paywall";
import { academyTierHas } from "@/lib/academy-features";
import type { Academy } from "./shared";

/**
 * Gate client-side por feature (mismo criterio que el 403 tier.required
 * del API - spec unified-actor-entitlements + academy-tier-gate-staff):
 * la feature se deriva de `academy.tier` (viaja en /academies/mine para
 * owner, staff e instructor por igual) - NO de useActorEntitlements,
 * que solo resuelve las academias propias del owner y dejaba a
 * staff/instructor con paywall permanente. Si el tier no cubre la
 * feature se muestra el TierPaywall en vez del contenido.
 */
export function AcademyTierGate({
  academy,
  feature,
  children,
}: {
  academy: Academy;
  feature: string;
  children: React.ReactNode;
}) {
  if (!academyTierHas(academy.tier, feature)) {
    return <TierPaywall actorType="ACADEMY" feature={feature} />;
  }
  return <>{children}</>;
}
