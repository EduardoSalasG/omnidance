// Misma card que opengraph-image: twitter:image no hereda og:image en
// varios crawlers, así que Next la emite desde su propia convención.
// `runtime` debe ser literal — el re-export no lo reconoce Next y cae al
// runtime node, donde el prerender de @vercel/og falla (Invalid URL).
export const runtime = "edge";
export { alt, size, contentType, default } from "./opengraph-image";
