## ADDED Requirements

### Requirement: Baja lógica de usuario

`DELETE /admin/users/:personId` SHALL marcar la cuenta como desactivada
(`Person.deletedAt`) sin eliminar filas — el grafo de datos (academias,
eventos, tickets, roles, historial) queda intacto. Una cuenta
desactivada MUST NO poder autenticarse por ningún mecanismo (sesión,
password, magic link, OTP) y MUST NO aparecer en superficies públicas
de personas (búsqueda, perfil público, amigos, listas, pases,
prácticas). Su email SHALL seguir ocupado (re-registro → 409).
`POST /admin/users/:personId/reactivate` SHALL restaurarla (deletedAt
null) con sus datos intactos. Ambas acciones MUST quedar en AuditLog
(`USER_DELETE` / `USER_REACTIVATE`). Auto-eliminación SHALL seguir
rechazada con 400.

#### Scenario: Desactivar conserva el grafo

- WHEN un admin desactiva un usuario con roles, academia y estilos
- THEN la fila `Person` persiste con `deletedAt` set y todas las
  filas relacionadas siguen existiendo

#### Scenario: Auth bloqueada

- WHEN la cuenta desactivada intenta login por password, magic link,
  OTP o usa una sesión previa
- THEN todas las rutas rechazan (401 genérico de credenciales para
  login, 401 para sesión, 401 para verify)

#### Scenario: Email ocupado tras desactivación

- WHEN alguien registra con el email de una cuenta desactivada
- THEN recibe 409 emailTaken — el email no se libera

#### Scenario: Reactivación restaura el acceso

- WHEN un admin llama `POST /admin/users/:personId/reactivate` sobre
  una cuenta desactivada
- THEN `deletedAt` queda null y el usuario puede autenticarse de
  nuevo con sus datos intactos
