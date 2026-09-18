import type { MetadataRoute } from "next";

const WEB_URL = process.env.NEXT_PUBLIC_WEB_URL ?? "http://localhost:3000";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  // Solo rutas públicas indexables — el resto son superficies de app.
  return ["/", "/eventos", "/login"].map((path) => ({
    url: `${WEB_URL}${path}`,
    lastModified,
  }));
}
