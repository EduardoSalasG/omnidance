"use client";

import { useTranslations } from "next-intl";
import { Badge, Button, Card } from "@/components/ui";
import { PageLoading } from "@/components/ui/spinner";
import { useAcademyEntitlements } from "@/lib/academy-entitlements-context";
import type { Academy } from "./shared";

/** Destino del CTA de upgrade: la sección del plan vive en /academia/suscripcion. */
const UPGRADE_HREF = "/academia/suscripcion";

// Tier mínimo por feature (espejo de requiredTierFor en
// apps/api/src/academies/domain/academy-tiers.ts).
const FEATURE_TIER: Record<string, "COBROS" | "STUDIO" | "PRO"> = {
  classes: "STUDIO",
  attendance: "STUDIO",
  staff: "STUDIO",
  exports: "STUDIO",
  presales: "STUDIO",
  analytics: "PRO",
  crm: "PRO",
  videos: "PRO",
  insights: "PRO",
  multiAcademy: "PRO",
};

function LockIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-5 w-5 shrink-0 text-neon"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="4" y="10" width="16" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

/**
 * Paywall por tier de academia (spec academy-tier-cobros, mismo patrón
 * que ProPaywall de productor): se renderiza donde una feature no
 * cubierta respondió 403 `tier.required` o donde los entitlements del
 * owner ya dicen que el plan no la incluye. CTA a /academia/suscripcion.
 */
export function AcademyTierPaywall({
  feature,
  requiredTier,
}: {
  feature?: string;
  requiredTier?: "COBROS" | "STUDIO" | "PRO";
}) {
  const t = useTranslations("academyTier");
  const tier = requiredTier ?? (feature ? FEATURE_TIER[feature] : undefined) ?? "STUDIO";

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <LockIcon />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">
            {feature
              ? t("featureTitle", { feature: t(`features.${feature}`) })
              : t("title")}
          </p>
          <p className="text-sm text-ink/60">
            {t("partOf", { tier: t(`tiers.${tier}`) })}
          </p>
        </div>
        <Badge variant="neon">{t(`tiers.${tier}`)}</Badge>
      </div>
      <p role="status" className="text-sm text-ink/70">
        {t("desc")}
      </p>
      <Button href={UPGRADE_HREF} className="self-start">
        {t("cta")}
      </Button>
    </Card>
  );
}

/**
 * Gate client-side por feature (mismo criterio que el 403 del API):
 * entitlements del owner → si la academia seleccionada no cubre la
 * feature se muestra el paywall en vez del contenido. Mientras resuelve
 * muestra PageLoading (los entitlements vienen del provider compartido -
 * casi siempre ya están).
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
  const { has, loading } = useAcademyEntitlements(academy.id);
  if (loading) return <PageLoading />;
  if (!has(feature)) {
    return <AcademyTierPaywall feature={feature} />;
  }
  return <>{children}</>;
}
