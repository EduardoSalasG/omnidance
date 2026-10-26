// Normalización de teléfonos (spec multipais-phone): Person.phone se
// persiste en E.164 con "+" y Person.phoneCountryCode guarda el ISO-2
// DERIVADO del número parseado - nunca se confía en el declarado por el
// cliente (el `phoneCountryCode` de los DTOs es solo el hint de país
// para interpretar un número nacional).

import {
  getCountries,
  getCountryCallingCode,
  isSupportedCountry,
  parsePhoneNumber,
  type CountryCode,
} from "libphonenumber-js";

/** Teléfono que no parsea o no es válido para su país. Los controllers
 * lo traducen a `400 telefono_invalido` (mismo contrato de siempre). */
export class InvalidPhoneError extends Error {
  constructor(public readonly raw: string) {
    super("teléfono inválido");
    this.name = "InvalidPhoneError";
  }
}

export interface NormalizedPhone {
  /** E.164 con "+" - forma canónica de Person.phone (@unique). */
  e164: string;
  /** ISO-3166 alpha-2 derivado del número - va a Person.phoneCountryCode.
   * null solo para numeración no geográfica (+800 y similares). */
  countryCode: string | null;
}

function resolveDefaultCountry(defaultCountry: string): CountryCode {
  const cc = (defaultCountry ?? "").trim().toUpperCase();
  if (!isSupportedCountry(cc)) {
    throw new InvalidPhoneError(`país no soportado: ${defaultCountry}`);
  }
  return cc as CountryCode;
}

/**
 * `normalizePhone(raw, defaultCountry)` (spec multipais-phone P1):
 *
 * - `raw` vacío/espacios → `null` (limpiar teléfono).
 * - `raw` con "+" inicial → parseo E.164; el país sale del número y
 *   `defaultCountry` se ignora (override internacional).
 * - Sin "+" → formato nacional interpretado con `defaultCountry`.
 * - Inválido (no parsea o `isValid()` false) → `InvalidPhoneError`.
 */
export function normalizePhone(
  raw: string | null | undefined,
  defaultCountry: string,
): NormalizedPhone | null {
  const text = (raw ?? "").trim();
  if (text === "") return null;
  let parsed;
  try {
    parsed = text.startsWith("+")
      ? parsePhoneNumber(text)
      : parsePhoneNumber(text, resolveDefaultCountry(defaultCountry));
  } catch (e) {
    if (e instanceof InvalidPhoneError) throw e;
    throw new InvalidPhoneError(text);
  }
  if (!parsed.isValid()) throw new InvalidPhoneError(text);
  return { e164: parsed.number, countryCode: parsed.country ?? null };
}

/**
 * Variante tolerante de `normalizePhone` para datos legados (p.ej.
 * `Lead.phone` escrito antes del spec, en formato nacional CL): mismo
 * resultado cuando el valor parsea, `null` en vez de `InvalidPhoneError`
 * cuando no - el caller decide el fallback (típicamente copiar verbatim,
 * como hacía el código pre-spec).
 */
export function normalizePhoneOrNull(
  raw: string | null | undefined,
  defaultCountry: string,
): NormalizedPhone | null {
  try {
    return normalizePhone(raw, defaultCountry);
  } catch {
    return null;
  }
}

/**
 * País que declara un número con "+" - indulgente: devuelve el país
 * aunque el número esté incompleto o sea inválido, para que la UI
 * cambie a modo internacional apenas se pueda saber. Sin "+" (o sin
 * país derivable) devuelve `fallback`.
 */
export function phoneCountryOf(
  raw: string | null | undefined,
  fallback: string | null = null,
): string | null {
  const text = (raw ?? "").trim();
  if (!text.startsWith("+")) return fallback;
  try {
    return parsePhoneNumber(text).country ?? fallback;
  } catch {
    return fallback;
  }
}

/** Formato nacional legible de un E.164 ("+56912345678" → "912345678";
 * los móviles CL no llevan separador - fijos/otros países sí, p.ej.
 * "+56221234567" → "(2) 2123 4567"). Devuelve el input intacto cuando
 * no parsea - para prefill de inputs. */
export function formatPhoneNational(raw: string | null | undefined): string {
  const text = (raw ?? "").trim();
  if (text === "") return "";
  try {
    return parsePhoneNumber(text).formatNational();
  } catch {
    return text;
  }
}

/** Catálogo de países marcables de libphonenumber (sin catálogo propio):
 * alimenta el selector de país del PhoneInput del front. */
export const PHONE_COUNTRIES: readonly { code: string; dialCode: string }[] =
  getCountries().map((code) => ({
    code,
    dialCode: `+${getCountryCallingCode(code)}`,
  }));
