"use client";

import { PageLoading } from "@/components/ui/spinner";
import { TierPaywall } from "@/components/tier-paywall";
import { useActorEntitlements } from "@/lib/entitlements-context";
import type { Academy } from "./shared";

/**
 * Gate client-side por feature (mismo criterio que el 403 tier.required
 * del API - spec unified-actor-entitlements): entitlements de la
 * academia seleccionada → si no cubre la feature se muestra el
 * TierPaywall en vez del contenido. Mientras resuelve muestra
 * PageLoading (los entitlements vienen del provider compartido - casi
 * siempre ya están).
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
  const { has, loading } = useActorEntitlements("ACADEMY", academy.id);
  if (loading) return <PageLoading />;
  if (!has(feature)) {
    return <TierPaywall actorType="ACADEMY" feature={feature} />;
  }
  return <>{children}</>;
}
