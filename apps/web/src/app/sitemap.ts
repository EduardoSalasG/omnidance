import type { MetadataRoute } from "next";
import { fetchStyles, styleSlug } from "@/lib/styles";

const WEB_URL = process.env.NEXT_PUBLIC_WEB_URL ?? "http://localhost:3000";
const API_URL = process.env.API_URL ?? "http://localhost:4000";

type PublicEvent = { id: string; startsAt: string };

// Eventos publicados para sus URLs /eventos/[id] — fallo silencioso: el
// sitemap nunca debe 500 aunque la API esté abajo.
async function fetchPublicEventIds(): Promise<PublicEvent[]> {
  try {
    const res = await fetch(`${API_URL}/api/events`, { cache: "no-store" });
    if (!res.ok) return [];
    const data = (await res.json()) as PublicEvent[];
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const lastModified = new Date();
  const [styles, events] = await Promise.all([
    fetchStyles(),
    fetchPublicEventIds(),
  ]);

  // Solo rutas públicas indexables — el resto son superficies de app.
  const entries: MetadataRoute.Sitemap = [
    "/",
    "/eventos",
    "/estilos",
    "/login",
  ].map((path) => ({ url: `${WEB_URL}${path}`, lastModified }));

  for (const s of styles) {
    entries.push({
      url: `${WEB_URL}/estilos/${styleSlug(s.name)}`,
      lastModified,
    });
  }
  for (const e of events) {
    entries.push({
      url: `${WEB_URL}/eventos/${e.id}`,
      lastModified: new Date(e.startsAt),
    });
  }
  return entries;
}
