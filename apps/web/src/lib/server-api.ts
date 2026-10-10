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
 * 4. Origin del request  - headers host/x-forwarded-*. En Netlify las
 *                          env de [build.environment] no llegan al
 *                          runtime del serverless: sin esto caía a
 *                          localhost y todo fetch SSR fallaba.
 * 5. localhost:4000      - dev local.
 */
export function serverApiUrl(): string {
  if (process.env.API_URL) return process.env.API_URL;
  if (process.env.API_PROXY_TARGET) return process.env.API_PROXY_TARGET;
  if (process.env.NEXT_PUBLIC_WEB_URL) return process.env.NEXT_PUBLIC_WEB_URL;
  try {
    const h = headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    if (host) {
      const local = host.startsWith("localhost") || host.startsWith("127.");
      const proto = h.get("x-forwarded-proto") ?? (local ? "http" : "https");
      return `${proto}://${host}`;
    }
  } catch {
    // Fuera de contexto de request (build, workers) - cae al fallback.
  }
  return "http://localhost:4000";
}
