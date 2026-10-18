import createNextIntlPlugin from "next-intl/plugin";
import bundleAnalyzer from "@next/bundle-analyzer";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");
// ANALYZE=true pnpm --filter @omnidance/web build → reporte HTML del
// bundle (auditoría de tamaño; default off para no pagar el costo).
const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

// Origen del API para el proxy same-origin: el browser pide /api/* al front
// y Next lo reenvía acá. Así PWA+túnel quedan same-origin (cookies Lax, sin
// cross-site - iOS Safari bloquea cookies third-party aun con SameSite=None).
// Default 127.0.0.1 (no "localhost"): en Windows "localhost" resuelve a
// veces ::1 y el API (Nest) solo escucha IPv4 → ECONNREFUSED intermitente
// en el proxy (login que falla 1 de N veces en dev, visto en e2e).
const API_PROXY_TARGET =
  process.env.API_PROXY_TARGET ?? "http://127.0.0.1:4000";

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@omnidance/shared"],
  poweredByHeader: false,
  // Streaming metadata: con generateMetadata async (getMessages por
  // locale) Next emite <title>/<meta> al <body> para usuarios; los UAs
  // de htmlLimitedBots (Googlebot, Lighthouse, Twitterbot, WhatsApp…)
  // reciben metadata bloqueante en <head>. El default cubre a los
  // crawlers que importan - NO extender a /.*/ (cada request re-
  // renderizaría y todo el árbol serviría no-store).
  // Security headers del documento (el API ya va por helmet): nosniff +
  // anti-framing + referrer mínimo + superficies sensibles cerradas salvo
  // lo que la app usa (cámara → scanner QR, geolocalización → mapa).
  // CSP queda pendiente: los scripts inline de Next/theme boot exigen
  // nonce por request (middleware) antes de poder activarla.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(self), geolocation=(self), microphone=()",
          },
        ],
      },
    ];
  },
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${API_PROXY_TARGET}/api/:path*` },
      {
        source: "/socket.io/:path*",
        destination: `${API_PROXY_TARGET}/socket.io/:path*`,
      },
    ];
  },
};

export default withBundleAnalyzer(withNextIntl(nextConfig));
