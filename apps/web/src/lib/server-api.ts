import { headers } from "next/headers";

/**
 * Base URL del API para server components/route handlers. El fetch del
 * servidor no puede usar URL relativa (no hay origin propio).
 *
 * Llamar dentro del render/fetch de la request - nunca a nivel módulo:
 * el fallback same-origin lee `headers()`, que solo existe en contexto
 * de request.
 *
 * Orden de resolución:
 * 1. API_URL             - override explícito (cross-site sin proxy).
 * 2. API_PROXY_TARGET    - mismo destino del rewrite /api/* de
 *                          next.config.mjs (directo al API).
 * 3. NEXT_PUBLIC_WEB_URL - la propia web: /api/* pasa por el rewrite.
 * 4. Host del request    - SOLO hosts locales (localhost/127/::1):
 *                          cubre `next start` de QA/e2e sin envs. Un
 *                          Host ajeno con envs faltantes no se usa
 *                          (audit B5): derivar la base del header
 *                          mandaría los fetch SSR con cookies del
 *                          usuario a un origen arbitrario.
 * 5. localhost:4000      - dev local. En producción sin envs válidas
 *                          falla explícito - nunca silencioso.
 */
// Solo loopback: el header es cliente-supeable si no hay proxy - con
// prefijo bastaría `127.0.0.1.evil.com` para bypassear. Se compara el
// hostname pelado (sin puerto, sin corchetes IPv6) con exactitud.
function isLocalHost(host: string): boolean {
  const name = host
    .replace(/:\d+$/, "")
    .replace(/^\[|\]$/g, "");
  return (
    name === "localhost" ||
    name === "::1" ||
    /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(name)
  );
}

export async function serverApiUrl(): Promise<string> {
  if (process.env.API_URL) return process.env.API_URL;
  if (process.env.API_PROXY_TARGET) return process.env.API_PROXY_TARGET;
  if (process.env.NEXT_PUBLIC_WEB_URL) return process.env.NEXT_PUBLIC_WEB_URL;
  try {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    if (host && isLocalHost(host)) {
      const proto = h.get("x-forwarded-proto") ?? "http";
      return `${proto}://${host}`;
    }
  } catch {
    // Fuera de contexto de request (build, workers) - cae al resultado.
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "serverApiUrl: sin API_URL/API_PROXY_TARGET/NEXT_PUBLIC_WEB_URL - " +
        "configurar una env antes de servir SSR",
    );
  }
  return "http://localhost:4000";
}
