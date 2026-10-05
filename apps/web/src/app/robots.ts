import type { MetadataRoute } from "next";

const WEB_URL = process.env.NEXT_PUBLIC_WEB_URL ?? "http://localhost:3000";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Superficies de app privadas/operativas — fuera del índice.
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
