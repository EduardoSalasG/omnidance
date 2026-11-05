import { serverApiUrl } from "@/lib/server-api";

/**
 * Lectura server-side del mapa público GET /features (mismo endpoint
 * que consume useFeatures en el cliente - spec admin "API de
 * administración y gating"). Para componentes de servidor que no
 * pueden usar el contexto (p.ej. la ficha /academias/[id]).
 * Fail-closed: error/red → false → la superficie gated no se muestra.
 */
export async function featureEnabled(key: string): Promise<boolean> {
  try {
    const res = await fetch(`${await serverApiUrl()}/api/features`, {
      next: { revalidate: 30 },
    });
    if (!res.ok) return false;
    const flags = (await res.json()) as Record<string, boolean>;
    return flags[key] === true;
  } catch {
    return false;
  }
}
