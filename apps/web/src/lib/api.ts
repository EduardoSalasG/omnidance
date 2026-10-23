// NEXT_PUBLIC_API_URL vacío (default) → URL relativa → same-origin, el
// rewrite de next.config.mjs proxea /api/* al API. Solo setearla para
// apuntar a un API en otro host sin proxy (modo cross-site).
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

export function apiFetch(path: string, init?: RequestInit) {
  return fetch(`${API_URL}/api${path}`, {
    credentials: "include",
    ...init,
  });
}

/**
 * ¿La respuesta es el gateo por tier? Contrato unificado (spec
 * unified-actor-entitlements): el API responde 403
 * `{error:"tier.required", upgrade:true, requiredTier, feature}` para
 * TODOS los actores (productor y academia) cuando la suscripción no
 * cubre la feature - `pro.required` ya no existe. Lee un clone - el
 * caller sigue pudiendo leer.
 */
export async function isTierRequired(res: Response): Promise<boolean> {
  if (res.status !== 403) return false;
  try {
    const body: unknown = await res.clone().json();
    return (
      !!body &&
      typeof body === "object" &&
      (body as { error?: unknown }).error === "tier.required"
    );
  } catch {
    return false;
  }
}
