# Proposal: api-edge-hardening

## Why

La auditoría 2026-11-10 (docs/security-audit-2026-11-10-exposure-ddos.md
y -backend.md) encontró vectores de abuso baratos contra el edge del API:
health público que toca la DB sin throttle, webhook de suscripciones que
dispara un sweep completo sin mutex, webhook de pagos que llama saliente
a la pasarela antes de validar, exports sin límite propio, magic-link sin
cap por email destino, Swagger público, magic token reutilizable, settle
que emite efectos con monto menor reportado, open redirect teórico por
`%5c`, y `xlsx@0.18.5` con CVEs.

## What Changes

- `GET /api/health` deja de tocar la DB (responde proceso); el check de
  DB pasa a `/api/health/db` con throttle normal (o restringido).
- `POST /api/payments/subscription-webhook`: lock en vuelo + cooldown
  (~60s) para `reconcileAll` disparado por callback.
- Webhooks de pagos: `@Throttle` dedicado (~30/60s/IP) en los endpoints
  que generan llamadas salientes a la pasarela.
- Exports (`/query/export.*`, `/events/:id/export.*`, `billing-report.*`):
  `@Throttle` estricto (~10/60s).
- Magic-link/register/resend: cap adicional por email destino (~5/h)
  in-memory, complemento del por-IP.
- Swagger `/api/docs*` gate por env `API_DOCS_ENABLED` (default off en
  producción; el script `export-api-docs.cjs` lo habilita on-demand).
- Magic token consumible: jti persistido (o marca de uso) con grace para
  prefetchers (acepta reuso solo si ya hay sesión válida de la misma
  Person, si no 401) — decide la opción más simple robusta.
- Settle: `gatewayReportedAmount < payment.amount` (o moneda distinta) →
  no emitir efecto; estado `PENDING_REVIEW` + alerta admin existente.
- `internalNext`: rechazar también `/` seguido de `%`.
- `xlsx` → reemplazar por alternativa mantenida (exceljs/read-excel-file)
  o aislar el parse.

## Capabilities

`api-hardening` + `auth` (magic token).

## Out of scope

CDN/WAF delante del API (Cloudflare: tarea del owner), límites nginx en
la VM (vhost nuevo va en `deploy/nginx/` dentro de este change como
artefacto de repo, instalación manual del owner).
