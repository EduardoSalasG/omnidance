# Proposal — add-clarity

## Why

Además de GTM (medición/marketing) necesitamos Microsoft Clarity
(proyecto `z4swabie90`) para heatmaps y grabaciones de sesión — el
"por qué" detrás de los números en landings y flujos de conversión.

## What Changes

- Snippet oficial de Clarity en `<head>` del root layout, gateado por
  `NEXT_PUBLIC_CLARITY_ID` (mismo patrón que GTM: sin la var no se
  renderiza nada).
- `NEXT_PUBLIC_CLARITY_ID = "z4swabie90"` en `netlify.toml`
  `build.environment` + documentado en el bloque de env vars.
- CSP (`middleware.ts`): `script-src` permite `https://*.clarity.ms`
  (el tag carga `www.clarity.ms/tag/<id>` y puede inyectar recursos de
  otros subdominios). `connect-src`/`img-src` (`https:`) ya cubren la
  telemetría.

## Capabilities

### New Capabilities

(ninguna — extiende la existente)

### Modified Capabilities

- `web-tag-manager`: se agregan requirements para el bootstrap de
  Clarity y sus permisos CSP.

## Impact

- `apps/web/src/app/[locale]/layout.tsx` — monta `<ClarityScript/>`.
- `apps/web/src/components/clarity.tsx` — nuevo componente.
- `apps/web/src/middleware.ts` — `script-src` suma `https://*.clarity.ms`.
- `netlify.toml` — env var de build.
- Sin cambios de API, schema ni contratos.
