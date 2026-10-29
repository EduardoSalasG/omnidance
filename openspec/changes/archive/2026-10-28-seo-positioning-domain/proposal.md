# Proposal; seo-positioning-domain

## Why

`omnidance.tech` es el dominio primario (DNS → Netlify, responde 200)
pero `NEXT_PUBLIC_WEB_URL` quedó fijada a `omnidance.netlify.app`:
canonical, og:url, sitemap y JSON-LD declaran el subdominio Netlify;
los share sheets móviles, WhatsApp y los buscadores resuelven el
dominio "equivocado". Además el posicionamiento del producto
("gestión de academias + eventos de productores + referencia de
sociales y congresos") no está reflejado en el metadata global ni en
una guía para agentes de IA (`llms.txt`).

## What Changes

- `NEXT_PUBLIC_WEB_URL = "https://omnidance.tech"` en `netlify.toml` →
  canonical, og:url, sitemap, robots y JSON-LD emiten el dominio
  primario.
- Metadata global del root layout (title/description/keywords)
  actualizada al posicionamiento: app de gestión para academias de
  baile y productores de eventos, referencia de sociales y congresos.
- Nuevo `public/llms.txt` con resumen del sitio para crawlers de IA.
- `docs/ci-cd.md`: `WEB_URL`/`CORS_ORIGINS` del `.env` de la VM pasan a
  `https://omnidance.tech` (los links que el API genera en emails/ICS/
  claims dejan de apuntar al subdominio) + nota de dominio primario en
  Netlify.
- **No se toca el copy de las landings** (decisión explícita).

## Capabilities

### New Capabilities

(ninguna)

### Modified Capabilities

- `landing-marketing`: nuevo requirement de identidad de dominio y
  posicionamiento SEO para el sitio público.

## Impact

- `netlify.toml`, `apps/web/src/app/[locale]/layout.tsx` (metadata),
  `apps/web/public/llms.txt` (nuevo), `docs/ci-cd.md`.
- **Fuera del repo**: el `.env` de la VM debe actualizar `WEB_URL` y
  `CORS_ORIGINS` a `https://omnidance.tech` en el próximo deploy del
  API; en Netlify confirmar `omnidance.tech` como dominio primario.
- Sin cambios de API, schema ni contratos.
