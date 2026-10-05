# Proposal — api-hardening

## Why

Antes de producción la API necesita hardening básico: hoy no hay rate
limit global (el magic-link de auth es atacable a spam/fuerza bruta) ni
security headers (helmet).

## What Changes

- `helmet` en `main.ts` (headers de seguridad estándar).
- `@nestjs/throttler` global vía `APP_GUARD`: límite generoso por IP
  (~300 req/min — no rompe polling del checkout ni la app) + límites
  estrictos en `/api/auth/magic-link`, `/api/auth/login`,
  `/api/auth/register` (~5-10/min — anti-spam de correos y fuerza
  bruta). Límites por env para no romper e2e (`THROTTLE_*`, disabled
  o muy alto en `NODE_ENV=test`).
- Respuesta 429 honesta.

## Out of scope

- Storage distribuido del throttler (Redis) — nota para multi-instancia
  futura; hoy in-memory alcanza (1 proceso).
