# Design — seo-positioning-domain

## Decisiones

- **`NEXT_PUBLIC_WEB_URL` es la única fuente**: `lib/site-url.ts` ya
  resuelve `NEXT_PUBLIC_WEB_URL → URL (Netlify) → localhost`. Cambiar
  el valor en `netlify.toml` repinta canonical/og/sitemap/robots/JSON-LD
  sin tocar código. Comentario del toml actualizado (ya no es "sin ella
  salían como localhost" sino dominio primario).
- **Metadata global en `layout.tsx`**: `SITE_TITLE` pasa a
  "Omnidance - gestión de academias y eventos de baile" y
  `SITE_DESCRIPTION` al posicionamiento completo; keywords agregan
  términos de gestión/ticketing/congresos. Sin tocar copy de páginas.
- **`llms.txt` estático** en `apps/web/public/llms.txt`: el contenido
  es fijo y el dominio ya está decidido — un archivo estático evita una
  route y queda cacheable en el edge.
- **`docs/ci-cd.md`**: actualiza el bloque de `.env` de la VM
  (`WEB_URL`, `CORS_ORIGINS`) y agrega nota de dominio primario en
  Netlify + paso manual de actualizar el `.env` del servidor.
- **Sin redirect netlify.app → omnidance.tech por ahora**: la
  redirección del subdominio se configura en Netlify UI (domain
  management), no por código; queda documentado en ci-cd.md como paso
  manual recomendado.

## Riesgos

- Si `omnidance.tech` deja de resolver → canonical roto. Mitigado: DNS
  ya apunta a Netlify (verificado: A `75.2.60.5`, www CNAME al site,
  HTTPS 200).
- Sessions en curso bajo netlify.app: cookies son por dominio — usuarios
  que entren por el subdominio viejo y luego al .tech verán sesión
  separada; aceptable (mismo comportamiento actual entre dominios).
