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
 * ¿La respuesta es el gateo Producer Pro? El API responde 403
 * `{error:"pro.required", upgrade:true}` en las features Pro cuando el
 * actor es el productor sin Pro efectivo (spec academy-saas-billing).
 * Lee un clone — el caller puede seguir usando res.json()/readError.
 */
export async function isProRequired(res: Response): Promise<boolean> {
  if (res.status !== 403) return false;
  try {
    const body: unknown = await res.clone().json();
    return (
      !!body &&
      typeof body === "object" &&
      (body as { error?: unknown }).error === "pro.required"
    );
  } catch {
    return false;
  }
}
