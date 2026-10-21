import type { MetadataRoute } from "next";
// fetchPublicEvents quitado: las fichas de evento piden sesión y no
// se indexan (el middleware las redirige a login).
import { fetchPublicCities } from "@/lib/public-cities";
import { SITE_URL as WEB_URL } from "@/lib/site-url";
import { routing, type Locale } from "@/i18n/routing";

// hreflang por entrada: la URL default (es-CL, sin prefijo) + las
// variantes prefijadas. Google toma las alternates desde el sitemap.
function languages(path: string): Record<Locale, string> {
  const out = {} as Record<Locale, string>;
  for (const l of routing.locales) {
    out[l] = `${WEB_URL}${l === routing.defaultLocale ? path : `/${l}${path === "/" ? "" : path}`}`;
  }
  return out;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const lastModified = new Date();
  const cities = await fetchPublicCities();

  // Solo rutas públicas indexables - el resto son superficies de app.
  const entries: MetadataRoute.Sitemap = [
    "/",
    "/pro",
    "/para-academias",
    "/para-productores",
    // /eventos y /eventos/[id] piden sesión (middleware): fuera del
    // sitemap para no indexar redirects a login.
    "/ciudades",
    "/pase",
    "/login",
    "/terminos",
    "/privacidad",
  ].map((path) => ({
    url: `${WEB_URL}${path}`,
    lastModified,
    alternates: { languages: languages(path) },
  }));

  // Landings por ciudad (spec city-discovery): públicas e indexables.
  for (const c of cities ?? []) {
    entries.push({
      url: `${WEB_URL}/ciudades/${c.slug}`,
      lastModified,
      alternates: { languages: languages(`/ciudades/${c.slug}`) },
    });
  }
  return entries;
}
