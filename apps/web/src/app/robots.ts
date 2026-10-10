import type { MetadataRoute } from "next";
import { SITE_URL as WEB_URL } from "@/lib/site-url";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Superficies de app privadas/operativas - fuera del índice.
      // Disallow es por prefijo: /admin cubre /admin/*, etc.
      disallow: [
        "/admin",
        "/academia",
        "/productor",
        "/crm",
        "/inicio",
        "/perfil",
        "/staff",
        "/qr",
        "/escanear",
        "/notificaciones",
        "/bailes",
        "/entradas",
        "/practicas",
        "/checkout",
        "/*/checkout",
        "/api",
      ],
    },
    sitemap: `${WEB_URL}/sitemap.xml`,
  };
}
