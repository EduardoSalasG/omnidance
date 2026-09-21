import type { JsonLdEvent } from "@/components/landing/JsonLd";

const API_URL = process.env.API_URL ?? "http://localhost:4000";

// Eventos publicados para marketing: alimentan el ItemList de DanceEvent del
// JSON-LD y el contador "N eventos esta semana" del strip de prueba social.
// Fallo silencioso: la página no depende de esto.
export async function fetchPublicEvents(): Promise<JsonLdEvent[]> {
  try {
    const res = await fetch(`${API_URL}/api/events`, { cache: "no-store" });
    if (!res.ok) return [];
    const data = (await res.json()) as JsonLdEvent[];
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export function countThisWeek(events: JsonLdEvent[]): number {
  const now = Date.now();
  const weekEnd = now + 7 * 24 * 60 * 60 * 1000;
  return events.filter((e) => {
    const at = new Date(e.startsAt).getTime();
    return at >= now && at <= weekEnd;
  }).length;
}
