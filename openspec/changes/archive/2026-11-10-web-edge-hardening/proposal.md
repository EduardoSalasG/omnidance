# Proposal: web-edge-hardening

## Why

La auditoría de seguridad frontend 2026-11-10
(docs/security-audit-2026-11-10-frontend.md) encontró una familia de
sinks `href` alimentados por datos de actores (M1, B1, B2, B3), una CSP
con `connect-src https:` que permite exfiltración a cualquier host
(M3), un click de push sin whitelist de destino (M4), cero masking de
Clarity en superficies con PII (M5), páginas del SW que sobreviven al
logout (B4) y un fallback de `serverApiUrl` al Host header del request
(B5). La auditoría Lighthouse del mismo día (docs/perf-lighthouse-
2026-11-10.md) suma dos oportunidades de borde: browserslist para
recortar polyfills (~11KB) y stale-while-revalidate en las landings
prerenderizadas.

## What Changes

- API - write path `http(s)` obligatorio (`cleanHttpUrl` central en
  `src/common/http-url.ts`, espejo de `cleanWebsite`): `details.url` de
  métodos `PAYMENT_LINK` (academia y productor, create y update),
  `video.url` (create y update), `payout.evidenceUrl` y
  `academy-deals` `markPaid.evidenceUrl`. Decisión: rechazo 400 en
  write - el actor corrige el dato en vez de perderlo en silencio.
- Web - `safeExternalHref()` en `lib/safe-external.ts` aplicado en
  todos los anchors externos con dato de actor: métodos propios
  (`own-method-picker`/`own-method-claim`, `manual-pay-panel`,
  checkout de pase de serie), videos (`videos.tsx`, `academias/page`,
  `video-form`), `resolveWebsite` de la ficha de academia,
  `evidenceUrl` (productor y admin finanzas), `pdfUrl` del venue y
  `href` de `infoRow` en admin/academias.
- `sw.js`: el click de notificación solo abre paths `/…` internos
  (misma regla que `safeInternalPath`); cualquier otra cosa cae a
  `/notificaciones`.
- CSP: `connect-src` pierde el `https:`/`wss:` genéricos y pasa a
  `'self'` + orígenes reales (GTM/GA4/Clarity + `NEXT_PUBLIC_API_URL`
  si algún despliegue cross-site la setea).
- Logout: borra `omnidance-pages-v1` (documentos `/staff/*` cacheados)
  antes de navegar.
- `serverApiUrl`: el fallback a Host/x-forwarded-host queda restringido
  a hosts loopback (cubre `next start` de QA local); en producción con
  Host ajeno y sin envs falla explícito.
- `browserslist` en `apps/web/package.json` con baseline moderno
  (recorta polyfills del bundle) y `expireTime` en `next.config.mjs`
  (stale-while-revalidate a nivel CDN para el HTML prerenderizado sin
  tocar el `must-revalidate` del browser).
- `data-clarity-mask="true"` en las superficies con PII/datos
  bancarios: detalles de método propio, panel manual del checkout,
  fichas de comprobante, identidad de `/perfil`, `/perfil/datos` y
  ficha de `/admin/usuarios/[personId]`.

## Capabilities

`web-edge-security` (nueva: postura de borde del front - sinks
externos, CSP, SW, masking, config SSR/deploy) + validación de URLs en
write del API cubierta por el mismo change.

## Out of scope

- M2/M6 (magic link reutilizable / login CSRF) y `internalNext` `%5c`
  del API: ya cubiertos por el change `api-edge-hardening`.
- Dedup Clarity/GTM (tag duplicado) y auditoría del workspace GTM:
  gestión del contenedor, fuera del repo.
- `script-src` con nonce / trusted types: mejora futura documentada en
  la auditoría, requiere render dinámico global.
- Resto de hallazgos BAJO/INFO sin sink (rotación JWT, settle por GET,
  COOP/report-uri).
