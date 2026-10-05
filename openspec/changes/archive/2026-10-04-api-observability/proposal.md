# Proposal — api-observability

## Why

La API solo usa el `Logger` por defecto de Nest en ~10 servicios: texto
plano sin estructura, sin request logging, sin correlation IDs y sin
control de nivel/redacción. En producción es imposible correlacionar un
error con el request que lo causó ni parsear logs con un collector.

## What Changes

- Winston como backend de logging de Nest (`WinstonModule` en
  `main.ts`): todo el `Logger` existente y los logs internos del
  framework salen por winston.
- Formato por entorno: pretty (nestLike, colores) en dev; JSON
  estructurado (timestamp, level, context, stack) en producción.
- Middleware de request: `x-request-id` por request (echo del header
  entrante o UUID nuevo), propagado vía `AsyncLocalStorage` a todos los
  logs dentro del request, y una línea resumen por request
  (method/path/status/duration/actorId) al `finish`.
- Redacción: claves que matcheen secrets/tokens (authorization, cookie,
  token, password, secret, jwt, qr payload…) se enmascaran antes de
  escribir — regla de seguridad del repo (nunca loggear QR ni creds).
- `LOG_LEVEL` env para nivel (`debug` dev / `info` prod por defecto).
- Exclusiones del request log: `/api/health`, docs de swagger.

## Scope

Solo `apps/api`. La parte web (Next.js) queda fuera — su observabilidad
sería otro stack (Sentry/similar), pedido aparte.
