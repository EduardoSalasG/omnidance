import type { MetadataRoute } from "next";

const WEB_URL = process.env.NEXT_PUBLIC_WEB_URL ?? "http://localhost:3000";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Superficies de app privadas/operativas — fuera del índice.
      disallow: [
        "/admin",
        "/perfil",
        "/staff",
        "/qr",
        "/notificaciones",
        "/api",
      ],
    },
    sitemap: `${WEB_URL}/sitemap.xml`,
  };
}
