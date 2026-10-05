# people-profile - deltas

## ADDED Requirements

### Requirement: Eliminación de persona por admin

`DELETE /api/admin/users/:personId` SHALL eliminar la `Person` en una
transacción junto con todas las filas que declaran FK hacia ella
(roles, perfil fiscal, style-roles, RSVPs, gigs DJ, notificaciones,
push tokens, suscripciones de plataforma como pagador; las
suscripciones donde figura como productor quedan con `producerId`
nulo). La acción SHALL auditarse como `USER_DELETE`. El endpoint MUST
rechazar borrar la propia cuenta en sesión (400) y responder 404 si
la persona no existe. Los ids históricos sin FK (tickets, audit log,
sesiones) no se tocan.

#### Scenario: admin elimina una cuenta

- **WHEN** un admin elimina a un usuario desde su ficha
- **THEN** la `Person` y sus filas con FK desaparecen, el email queda
  libre para re-registro y queda un `AuditLog USER_DELETE` con el
  email/nombre eliminado

#### Scenario: auto-eliminación bloqueada

- **WHEN** un admin intenta borrar su propia cuenta
- **THEN** responde 400 y nada se elimina
