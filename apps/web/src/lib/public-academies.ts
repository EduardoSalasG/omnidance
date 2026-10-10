import { SERVER_API_URL } from "@/lib/server-api";
const API_URL = SERVER_API_URL;

// GET /academies/public - directorio mínimo sin sesión (spec
// academies/owner-insights): alimenta el strip de prueba social de
// /para-academias. Fallo silencioso: la página no depende de esto.
export type PublicAcademy = {
  id: string;
  name: string;
  styles: { id: string; name: string }[];
};

export async function fetchPublicAcademies(): Promise<PublicAcademy[]> {
  try {
    const res = await fetch(`${API_URL}/api/academies/public`, {
      cache: "no-store",
    });
    if (!res.ok) return [];
    const data = (await res.json()) as PublicAcademy[];
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}
