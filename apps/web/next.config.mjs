import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// Origen del API para el proxy same-origin: el browser pide /api/* al front
// y Next lo reenvía acá. Así PWA+túnel quedan same-origin (cookies Lax, sin
// cross-site - iOS Safari bloquea cookies third-party aun con SameSite=None).
const API_PROXY_TARGET = process.env.API_PROXY_TARGET ?? "http://localhost:4000";

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@omnidance/shared"],
  poweredByHeader: false,
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

export default withNextIntl(nextConfig);
