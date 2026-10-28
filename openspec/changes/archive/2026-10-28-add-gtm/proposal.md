# Proposal — add-gtm

## Why

Hoy no existe medición de audiencia ni canal para tags de marketing en
la web: no podemos ver tráfico, conversión de landings → registro, ni
enlazar herramientas de analítica/ads sin tocar código cada vez. Google
Tag Manager (contenedor `GTM-W9KC3378`) habilita la gestión de tags sin
deploys futuros.

## What Changes

- Snippet GTM en `<head>` del root layout (`[locale]/layout.tsx`), lo
  más arriba posible, renderizado solo cuando `NEXT_PUBLIC_GTM_ID`
  está seteado.
- Noscript iframe de GTM como primer hijo de `<body>` (fallback sin JS).
- `NEXT_PUBLIC_GTM_ID = "GTM-W9KC3378"` en `netlify.toml`
  `build.environment` (prod) + documentado en el bloque de env vars.
- CSP (`middleware.ts`): `script-src` y nuevo `frame-src` permiten
  `https://www.googletagmanager.com`.

## Capabilities

### New Capabilities

- `web-tag-manager`: inyección del contenedor GTM en el documento,
  gating por env var y permisos CSP para el dominio del contenedor.

### Modified Capabilities

(ninguna — el CSP existente no tiene spec canónica; es detalle de
implementación)

## Impact

- `apps/web/src/app/[locale]/layout.tsx` — head + body.
- `apps/web/src/middleware.ts` — política CSP.
- `netlify.toml` — env var de build.
- Nuevo componente `apps/web/src/components/gtm.tsx`.
- Sin cambios de API, schema ni contratos. El container inyecta tags de
  terceros en runtime — `connect-src https:` / `img-src https:` ya los
  cubren; tags que carguen scripts de otros dominios requerirán
  ampliar `script-src` en cambios futuros.
