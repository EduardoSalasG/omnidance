# seo-landings — páginas de aterrizaje por estilo

La app solo tiene home + login indexables. Landings de conversión por
estilo de baile (bachata, salsa, casino…) con contenido SSR.

## Alcance

1. `GET /styles` público ya existe; `/estilos/[slug]` SSR con metadata,
   OG y JSON-LD — próximos eventos del estilo + academias que lo enseñan.
2. `sitemap.ts` (estilos + eventos publicados) y `robots.ts`.
3. CTA a `/login`/`/eventos` en cada landing.

## Fuera de scope

- Landings por ciudad o venue (datos insuficientes hoy).
- Blog/contenido editorial.
