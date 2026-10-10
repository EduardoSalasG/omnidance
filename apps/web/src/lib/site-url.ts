// URL pública del sitio para canonical/OG/sitemap/robots/JSON-LD.
// Resuelve en build-time (las páginas de marketing son estáticas):
//   1. NEXT_PUBLIC_WEB_URL - override explícito (pintada en netlify.toml).
//   2. URL - var que Netlify inyecta en todos los builds (dominio primario
//      del site). Cubre previews y sobrevive si falta la del toml.
//   3. localhost - dev local.
// Sin estos fallbacks metadataBase caía a localhost:3000 en prod y los
// og:url/canonical que leen WhatsApp/crawlers salían como localhost.
export const SITE_URL = (
  process.env.NEXT_PUBLIC_WEB_URL ??
  process.env.URL ??
  "http://localhost:3000"
).replace(/\/+$/, "");
