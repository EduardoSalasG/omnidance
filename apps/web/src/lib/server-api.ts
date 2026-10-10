/**
 * Base URL del API para server components/route handlers. El fetch del
 * servidor no puede usar URL relativa (no hay origin propio), así que
 * el fallback localhost solo aplica en dev.
 *
 * Orden de resolución:
 * 1. API_URL             - override explícito (cross-site sin proxy).
 * 2. API_PROXY_TARGET    - Netlify: mismo destino del rewrite /api/*
 *                          de next.config.mjs (ya va al API directo).
 * 3. NEXT_PUBLIC_WEB_URL - la propia web: /api/* pasa por el rewrite
 *                          en el edge (un hop más, pero no requiere
 *                          env nueva si falta API_PROXY_TARGET).
 * 4. localhost:4000      - dev local.
 */
export const SERVER_API_URL =
  process.env.API_URL ??
  process.env.API_PROXY_TARGET ??
  process.env.NEXT_PUBLIC_WEB_URL ??
  "http://localhost:4000";
