# api-hardening Specification

## Purpose
Hardening HTTP global de la API: headers de seguridad vía helmet (CSP desactivada por Swagger UI) y rate limiting con @nestjs/throttler — límite global por env, límite estricto en `/auth/*`, skip en `NODE_ENV=test` y contextos no-HTTP.

## Requirements

### Requirement: Security headers

Toda respuesta HTTP de la API SHALL incluir los headers de seguridad
estándar provistos por `helmet` (X-Content-Type-Options,
X-Frame-Options, Referrer-Policy, etc.), configurado en bootstrap antes
del resto del pipeline.

#### Scenario: headers presentes

- **WHEN** se hace cualquier request a la API
- **THEN** la respuesta incluye `x-content-type-options: nosniff` y
  headers helmet de navegación segura.

### Requirement: Rate limiting global

La API SHALL limitar requests por IP con un límite global generoso
(default ~300/minuto) que no afecte uso normal de la app (incluido el
polling del checkout), y SHALL responder `429` con información de
reintento al excederlo. Los endpoints de autenticación
(`POST /api/auth/magic-link`, `/api/auth/login`, `/api/auth/register`)
SHALL tener un límite estricto (default ~5-10/minuto) anti spam y
fuerza bruta. Los límites SHALL ser configurables por variables de
entorno.

#### Scenario: abuso de magic-link

- **WHEN** una IP supera el límite estricto de `POST /api/auth/magic-link`
- **THEN** la API responde 429 y no envía correos adicionales.

#### Scenario: uso normal no afectado

- **WHEN** un usuario navega la app y hace polling del checkout
- **THEN** ninguna respuesta es 429 bajo el límite global.
