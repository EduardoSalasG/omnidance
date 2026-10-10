import type { MetadataRoute } from "next";
import { fetchPublicEvents } from "@/lib/public-events";
import { SITE_URL as WEB_URL } from "@/lib/site-url";

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
  ].map((path) => ({ url: `${WEB_URL}${path}`, lastModified }));

  for (const e of events) {
    entries.push({
      url: `${WEB_URL}/eventos/${e.id}`,
      lastModified: new Date(e.startsAt),
    });
  }
  return entries;
}
