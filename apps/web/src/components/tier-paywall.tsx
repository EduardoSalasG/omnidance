"use client";

import { useTranslations } from "next-intl";
import { Badge, Button, Card } from "@/components/ui";
import type { EntitlementActorType } from "@/lib/entitlements-context";

/** Destino del CTA de upgrade según el actor gateado. */
const UPGRADE_HREF: Record<EntitlementActorType, string> = {
  ACADEMY: "/academia/suscripcion",
  PRODUCER: "/productor/suscripcion",
};

// Tier mínimo por feature cuando el 403 no trajo requiredTier (espejo
// de requiredTierFor en apps/api/src/academies/domain/academy-tiers.ts).
// Para PRODUCER no hay mapa: hoy todo lo gateado es "PRO" binario - la
// matriz PRODUCER_FEATURES del API ya devuelve requiredTier en el 403.
const FEATURE_TIER: Record<string, string> = {
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

// Features Pro del productor cuyo beneficio se lista bajo el título
// (copy de la ficha de suscripción - refuerza el upsell).
const PRODUCER_BENEFITS = ["analytics", "exports", "crm"] as const;

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
 * Paywall unificado por tier (spec unified-actor-entitlements - fusiona
 * el antiguo ProPaywall de productor y AcademyTierPaywall): se renderiza
 * donde una feature no cubierta respondió 403 `tier.required` o donde
 * los entitlements del actor ya dicen que el plan no la incluye. El CTA
 * lleva a la suscripción del actor (/academia/suscripcion o
 * /productor/suscripcion). `feature` nombra la herramienta bloqueada y
 * `requiredTier` pisa el tier deducido (viene en el body del 403).
 */
export function TierPaywall({
  feature,
  requiredTier,
  actorType,
}: {
  feature?: string;
  requiredTier?: string;
  actorType: EntitlementActorType;
}) {
  const t = useTranslations("tierGate");
  const tier =
    requiredTier ??
    (feature ? FEATURE_TIER[feature] : undefined) ??
    (actorType === "PRODUCER" ? "PRO" : "STUDIO");
  const tierLabel = t.has(`tiers.${tier}`) ? t(`tiers.${tier}`) : tier;
  const featureLabel =
    feature != null
      ? t.has(`features.${feature}`)
        ? t(`features.${feature}`)
        : feature
      : null;

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <LockIcon />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">
            {featureLabel
              ? t("featureTitle", { feature: featureLabel })
              : t("title")}
          </p>
          <p className="text-sm text-ink/60">
            {t("partOf", { tier: tierLabel })}
          </p>
        </div>
        <Badge variant="neon">{tierLabel}</Badge>
      </div>
      {actorType === "PRODUCER" ? (
        <ul className="flex flex-col gap-1.5 text-sm text-ink/70">
          {PRODUCER_BENEFITS.map((b) => (
            <li key={b} className="flex items-start gap-2">
              <span aria-hidden="true" className="text-neon">
                ·
              </span>
              {t(`benefits.${b}`)}
            </li>
          ))}
        </ul>
      ) : (
        <p role="status" className="text-sm text-ink/70">
          {t("desc")}
        </p>
      )}
      <Button href={UPGRADE_HREF[actorType]} className="self-start">
        {t("cta")}
      </Button>
    </Card>
  );
}
