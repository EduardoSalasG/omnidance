## ADDED Requirements

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
