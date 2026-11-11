# auth Specification

## Purpose
TBD - created by archiving change api-edge-hardening. Update Purpose after archive.

## Requirements

### Requirement: Magic token de uso limitado

El magic link SHALL dejar de mintear sesiones ilimitadas dentro de su
TTL: tras el primer verify exitoso, un reuso SHALL solo aceptarse si la
request ya trae una sesión válida de la misma Person (relogin/prefetch);
en cualquier otro caso responde error sin emitir sesión. La solución
SHALL persistir una marca de uso (jti/token hash consumido o equivalente)
— un JWT puro sin estado no cumple.

#### Scenario: Link reutilizado por tercero

- WHEN un magic token ya usado se reenvía a otro navegador sin sesión
- THEN `/auth/verify` no emite cookie de sesión

#### Scenario: Prefetch del correo corporativo

- WHEN el prefetcher de un scanner de correo ejecuta el verify y luego el
  usuario real abre el link desde el mismo navegador con sesión emitida
- THEN el reuso con sesión válida de la misma Person pasa (grace)

### Requirement: Sesiones persistidas y revocables

Toda emisión de sesión SHALL crear una `AuthSession` con jti único,
`personId`, `userAgent`, `ip`, `createdAt`, `lastSeenAt` y `revokedAt`.
`SessionGuard` SHALL rechazar un JWT cuyo `AuthSession.revokedAt` no sea
null. `lastSeenAt` SHALL actualizarse con muestreo (máx 1 write por
minuto por sesión) para no escribir en cada request.

#### Scenario: Revocar mata la sesión

- WHEN una AuthSession queda `revokedAt` no nulo y el cliente reusa su JWT
- THEN la API responde 401 en la siguiente request

### Requirement: Gestión de sesiones del usuario

`GET /me/sessions` SHALL listar las sesiones activas del actor con
dispositivo (UA parseado), IP, creada y última actividad, marcando la
sesión actual. `DELETE /me/sessions/:id` SHALL revocar la sesión propia;
`POST /me/sessions/revoke-others` SHALL revocar todas menos la actual.

#### Scenario: Cerrar otras sesiones

- WHEN el actor revoca "otras" desde su teléfono
- THEN su sesión actual sigue válida y el resto responde 401

### Requirement: Revocación administrativa

`GET /admin/users/:personId/sessions` SHALL listar sesiones de cualquier
persona (admin.access). `DELETE /admin/sessions/:id` y
`POST /admin/users/:personId/sessions/revoke-all` SHALL revocar.

#### Scenario: Admin mata sesiones de un usuario

- WHEN el admin revoca todas las sesiones de la persona X
- THEN cualquier JWT de X responde 401 aunque esté vigente
