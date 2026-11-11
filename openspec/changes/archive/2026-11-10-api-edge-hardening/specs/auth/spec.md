## ADDED Requirements

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
