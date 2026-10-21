/**
 * Jurisdicción legal del actor (spec consent-por-jurisdiccion): se
 * resuelve desde el país declarado en el alta (`country` ISO-3166
 * alpha-2 en POST /auth/register). No es geo-IP - es el país que la
 * persona declara.
 *
 * Mapeo: UE + EEE + Reino Unido → "EU" (consentimiento granular GDPR);
 * cualquier otro país o ausencia → "CL" (baseline chileno: Ley 19.628
 * según modificada por Ley 21.719, checkbox único "essential").
 *
 * GB se incluye aunque no sea EEE: UK GDPR mantiene el estándar GDPR
 * tras el Brexit, así que el tratamiento granular es el correcto.
 */

// Los 27 estados miembro de la UE + Islandia, Liechtenstein, Noruega
// (EEE) + Reino Unido (UK GDPR).
export const EU_JURISDICTION_COUNTRIES = new Set([
  "AT", // Austria
  "BE", // Bélgica
  "BG", // Bulgaria
  "HR", // Croacia
  "CY", // Chipre
  "CZ", // Chequia
  "DK", // Dinamarca
  "EE", // Estonia
  "FI", // Finlandia
  "FR", // Francia
  "DE", // Alemania
  "GR", // Grecia
  "HU", // Hungría
  "IE", // Irlanda
  "IT", // Italia
  "LV", // Letonia
  "LT", // Lituania
  "LU", // Luxemburgo
  "MT", // Malta
  "NL", // Países Bajos
  "PL", // Polonia
  "PT", // Portugal
  "RO", // Rumania
  "SK", // Eslovaquia
  "SI", // Eslovenia
  "ES", // España
  "SE", // Suecia
  "IS", // Islandia (EEE)
  "LI", // Liechtenstein (EEE)
  "NO", // Noruega (EEE)
  "GB", // Reino Unido (UK GDPR)
]);

export type Jurisdiction = "CL" | "EU";

export function resolveJurisdiction(country?: string | null): Jurisdiction {
  const code = country?.trim().toUpperCase();
  if (code && EU_JURISDICTION_COUNTRIES.has(code)) return "EU";
  return "CL";
}
