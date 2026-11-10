import { BadRequestException } from "@nestjs/common";

/**
 * URLs externas escritas por actores que después se renderizan en un
 * `href` (spec web-edge-security, audit M1/B2): whitelist `http(s)` en
 * write - misma regla que `cleanWebsite` de academies.controller pero
 * genérica.
 *
 * Semántica:
 * - `undefined` → `undefined` (campo ausente: el PATCH parcial no toca).
 * - `null`/`""` → `null` (limpiar el campo).
 * - Sin esquema → se asume `https://` (UX: "mpago.la/x" vale).
 * - Esquema distinto de http/https, host sin punto, o string no
 *   parseable → BadRequestException: rechazo, no null silencioso - el
 *   actor corrige el dato en vez de guardarlo vacío.
 */
export function cleanHttpUrl(
  v: string | null | undefined,
  field = "url",
): string | null | undefined {
  if (v === undefined) return undefined;
  const t = (v ?? "").trim();
  if (t === "") return null;
  const withScheme = /^https?:\/\//i.test(t) ? t : `https://${t}`;
  try {
    const url = new URL(withScheme);
    if (
      (url.protocol === "http:" || url.protocol === "https:") &&
      url.hostname.includes(".")
    ) {
      return url.toString().replace(/\/$/, "");
    }
  } catch {
    // Cae al rechazo común.
  }
  throw new BadRequestException(`${field} inválida`);
}

/**
 * `details` libre del método de cobro (academyPaymentMethod /
 * producerPaymentMethod): cuando el tipo es `PAYMENT_LINK` su `url`
 * alimenta directamente el `<a href>` del checkout - pasa por
 * `cleanHttpUrl`. Un `url` presente no-string (número/objeto en el
 * JSON libre) es malformado → 400. Otros tipos no llevan url
 * renderizable: el objeto viaja tal cual.
 */
export function sanitizeMethodDetails(
  type: string,
  details: Record<string, unknown>,
): Record<string, unknown> {
  if (type !== "PAYMENT_LINK" || !("url" in details)) return details;
  const raw = details.url;
  if (raw !== null && typeof raw !== "string") {
    throw new BadRequestException("url inválida");
  }
  return { ...details, url: cleanHttpUrl(raw, "url") };
}
