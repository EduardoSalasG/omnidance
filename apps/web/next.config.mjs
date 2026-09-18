import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// Origen del API para el proxy same-origin: el browser pide /api/* al front
// y Next lo reenvía acá. Así PWA+túnel quedan same-origin (cookies Lax, sin
// cross-site — iOS Safari bloquea cookies third-party aun con SameSite=None).
const API_PROXY_TARGET = process.env.API_PROXY_TARGET ?? "http://localhost:4000";

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@omnidance/shared"],
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
