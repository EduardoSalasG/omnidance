import type { MetadataRoute } from "next";
import { fetchPublicEvents } from "@/lib/public-events";

const WEB_URL = process.env.NEXT_PUBLIC_WEB_URL ?? "http://localhost:3000";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const lastModified = new Date();
  const events = await fetchPublicEvents();

  // Solo rutas públicas indexables — el resto son superficies de app.
  const entries: MetadataRoute.Sitemap = [
    "/",
    "/pro",
    "/eventos",
    "/login",
  ].map((path) => ({ url: `${WEB_URL}${path}`, lastModified }));

  for (const e of events) {
    entries.push({
      url: `${WEB_URL}/eventos/${e.id}`,
      lastModified: new Date(e.startsAt),
    });
  }
  return entries;
}
