import { serverApiUrl } from "@/lib/server-api";
import type { EventCardData } from "@/components/events/event-card";

/**
 * Fetches server-side del descubrimiento por ciudad (spec
 * city-discovery): endpoints públicos del API (sin sesión) que
 * alimentan /ciudades - directorio y landing - y el sitemap.
 *
 * Convenciones: null = fallo de red/API (error, no empty); 404 de
 * ciudad = "not-found" para que la página haga notFound(). El flag
 * city_landing se consulta contra el mapa público de GET /features
 * (mismo endpoint que consume useFeatures en la app).
 */

export type PublicCityListItem = {
  id: string;
  slug: string;
  name: string;
  country: { code: string; name: string };
  upcomingEvents: number;
};

export type PublicCityDetail = {
  id: string;
  slug: string;
  name: string;
  country: { code: string; name: string };
  lat: number | null;
  lng: number | null;
  upcomingEvents: EventCardData[];
  venues: { id: string; name: string }[];
  hasGuide: boolean;
  // Reservado para city-guides: la guía viaja dentro del mismo payload
  // cuando exista (hoy la API no la emite).
  guide?: { intro: string; nightlife: string; practical: string } | null;
};

/** ¿Flag city_landing ON? Fail-closed: error/red → false → notFound(). */
export async function cityLandingEnabled(): Promise<boolean> {
  try {
    const res = await fetch(`${await serverApiUrl()}/api/features`, {
      next: { revalidate: 30 },
    });
    if (!res.ok) return false;
    const flags = (await res.json()) as Record<string, boolean>;
    return flags.city_landing === true;
  } catch {
    return false;
  }
}

/** GET /cities - directorio ordenado por actividad. null en fallo. */
export async function fetchPublicCities(): Promise<
  PublicCityListItem[] | null
> {
  try {
    const res = await fetch(`${await serverApiUrl()}/api/cities`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as PublicCityListItem[];
    return Array.isArray(data) ? data : null;
  } catch {
    return null;
  }
}

/** GET /cities/:slug - ficha de la landing. 404 → "not-found". */
export async function fetchPublicCity(
  slug: string,
): Promise<PublicCityDetail | "not-found" | null> {
  try {
    const res = await fetch(
      `${await serverApiUrl()}/api/cities/${encodeURIComponent(slug)}`,
      { next: { revalidate: 60 } },
    );
    if (res.status === 404) return "not-found";
    if (!res.ok) return null;
    return (await res.json()) as PublicCityDetail;
  } catch {
    return null;
  }
}
