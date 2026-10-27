// Tipos y constantes compartidas del price book de tiers
// (/admin/facturacion/precios): listado, crear (/nuevo) y ficha (/[id]).

export type TierPrice = {
  id: string;
  tierCode: string;
  kind: "ACADEMY" | "PRODUCER";
  billingCycle: "MONTHLY" | "SEMIANNUAL" | "ANNUAL";
  countryCode: string;
  price: number;
  currency: string;
};

export const TIERS = [
  "COBROS",
  "STUDIO",
  "PRO",
  "PRO_STARTER",
  "PRO_GROWTH",
  "PRO_BIG",
  "ENTERPRISE",
  "SOCIAL_PASS",
] as const;

export const CYCLES = ["MONTHLY", "SEMIANNUAL", "ANNUAL"] as const;

/** Label i18n del ciclo de facturación (admin.tierPrices.cycle*). */
export function cycleLabel(
  t: (key: string) => string,
  c: string,
): string {
  return c === "MONTHLY"
    ? t("cycleMonthly")
    : c === "SEMIANNUAL"
      ? t("cycleSemiannual")
      : t("cycleAnnual");
}
