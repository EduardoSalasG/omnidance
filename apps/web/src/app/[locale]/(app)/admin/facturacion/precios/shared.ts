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
  displayName: string | null;
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

// La línea se deriva del tier: COBROS/STUDIO/PRO son los planes de
// academia; el resto (PRO_*, ENTERPRISE) es línea productor y
// SOCIAL_PASS se siembra PRODUCER/MONTHLY (social-pass.service).
const ACADEMY_TIER_CODES = new Set<string>(["COBROS", "STUDIO", "PRO"]);
export const kindForTier = (tierCode: string): "ACADEMY" | "PRODUCER" =>
  ACADEMY_TIER_CODES.has(tierCode) ? "ACADEMY" : "PRODUCER";

// Nombres públicos de los tiers (los tierCode persistidos son claves
// legacy que ya no coinciden con el marketing). El displayName de la
// fila manda; este mapa cubre las filas sembradas antes del rename
// (displayName NULL) y último recurso queda el código crudo.
export const TIER_LABELS: Record<string, string> = {
  COBROS: "Starter",
  STUDIO: "Studio",
  PRO: "Pro",
  ENTERPRISE: "Enterprise",
  PRO_STARTER: "Starter",
  PRO_GROWTH: "Standard",
  PRO_BIG: "Pro",
  SOCIAL_PASS: "Pase Social",
};

/** Nombre a mostrar de una fila del price book. */
export const tierLabel = (row: {
  tierCode: string;
  displayName?: string | null;
}): string =>
  row.displayName ?? TIER_LABELS[row.tierCode] ?? row.tierCode;

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
