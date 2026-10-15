import type { MetadataRoute } from "next";
import { fetchPublicEvents } from "@/lib/public-events";
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
  const events = await fetchPublicEvents();

  // Solo rutas públicas indexables - el resto son superficies de app.
  const entries: MetadataRoute.Sitemap = [
    "/",
    "/pro",
    "/para-academias",
    "/para-productores",
    "/eventos",
    "/login",
    "/terminos",
    "/privacidad",
  ].map((path) => ({
    url: `${WEB_URL}${path}`,
    lastModified,
    alternates: { languages: languages(path) },
  }));

  for (const e of events) {
    entries.push({
      url: `${WEB_URL}/eventos/${e.id}`,
      lastModified: new Date(e.startsAt),
      alternates: { languages: languages(`/eventos/${e.id}`) },
    });
  }
  return entries;
}
