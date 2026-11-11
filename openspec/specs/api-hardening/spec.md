# api-hardening Specification

## Purpose
Hardening HTTP global de la API: headers de seguridad vía helmet (CSP desactivada por Swagger UI) y rate limiting con @nestjs/throttler - límite global por env, límite estricto en `/auth/*`, skip en `NODE_ENV=test` y contextos no-HTTP.

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

### Requirement: Health sin base de datos

`GET /api/health` SHALL responder estado del proceso sin consultar la DB.
El check de DB SHALL exponerse como `/api/health/db` con el throttler
global aplicado.

#### Scenario: Flood al health

- WHEN un cliente golpea `/api/health` repetidamente sin auth
- THEN cada respuesta responde 200 sin ejecutar queries a Postgres

### Requirement: Cooldown de reconcile por webhook

`POST /api/payments/subscription-webhook` SHALL no disparar más de un
`reconcileAll` por ventana de ~60s: requests adicionales responden 200
sin ejecutar el sweep, y uno en vuelo impide solapamiento.

#### Scenario: Rafaga de callbacks

- WHEN llegan 5 POST consecutivos con token válido
- THEN el sweep corre una vez y los demás responden sin efecto

### Requirement: Throttle dedicado en webhooks de pago

Los endpoints `POST /api/payments/webhook*` SHALL llevar `@Throttle`
estricto (~30 req/60s por IP) además del global.

#### Scenario: Amplificación bloqueada

- WHEN un cliente supera el límite del webhook
- THEN la API responde 429 sin emitir llamadas salientes a la pasarela

### Requirement: Throttle en exports pesados

`GET /api/query/export.csv|pdf`, `GET /api/events/:id/export.*` y
`GET /academies/:id/billing-report.*` SHALL llevar `@Throttle` estricto
(~10 req/60s por IP).

#### Scenario: Iteración de exports

- WHEN un actor supera el límite de exports
- THEN la API responde 429

### Requirement: Cap por email en flujos de auth por correo

`magic-link`, `register` y `resend` de OTP SHALL aplicar un límite por
email destino (~5/hora, in-memory) además del por IP; superado responde
429 uniforme.

#### Scenario: Spam a una víctima

- WHEN distintas IPs piden magic link para el mismo correo más de 5
  veces en una hora
- THEN las siguientes responden 429 y no envían correo

### Requirement: Documentación de API cerrada en producción

`/api/docs` y `/api/docs-json` SHALL montarse solo si
`API_DOCS_ENABLED=true` o `NODE_ENV !== 'production'`; si no, 404.
`export-api-docs.cjs` SHALL funcionar apuntando a una instancia con el
flag habilitado.

#### Scenario: Probe en prod

- WHEN un anónimo pide `/api/docs` en producción sin el flag
- THEN responde 404

### Requirement: Settle conservador ante monto menor reportado

Cuando la pasarela reporta `gatewayReportedAmount < payment.amount` o
moneda distinta, el settle SHALL NOT emitir el efecto (ticket/enrollment/
pase) automáticamente: marca el pago para revisión (estado o flag de
pendiente de revisión + `AMOUNT_MISMATCH` + notificación admin, que ya
existe). `reported >= expected` liquida normal.

#### Scenario: BYO auto-liquida con cobro menor

- WHEN llega el confirm de una pasarela BYO con monto menor al de la orden
- THEN el pago no queda PAID ni emite efecto; queda marcado para revisión

### Requirement: Validación de `next` interno

`internalNext` SHALL rechazar `next` que comience con `/%` además de
`//` y `/\`.

#### Scenario: Backslash encoded

- WHEN el claim `next` es `/%5cevil.com`
- THEN se ignora y se usa el fallback seguro
