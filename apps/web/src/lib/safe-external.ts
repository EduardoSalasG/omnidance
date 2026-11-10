/**
 * Sanitiza un href externo provisto por un actor (spec
 * web-edge-security, audit frontend M1): solo URLs absolutas
 * `http:`/`https:` navegan - cualquier otro esquema (javascript:,
 * file:, data:, handlers custom) o string no parseable devuelve
 * `undefined` y el caller omite el anchor.
 *
 * Espejo del write path del API (`cleanHttpUrl`, que rechaza en write)
 * y hermano de `safeInternalPath` (`lib/safe-next.ts`, paths `/…`): la
 * barrera del render cubre la data histórica persistida antes de la
 * validación y cualquier bypass futuro del write path.
 */
export function safeExternalHref(
  url: string | null | undefined,
): string | undefined {
  if (!url) return undefined;
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:"
      ? u.href
      : undefined;
  } catch {
    return undefined;
  }
}
