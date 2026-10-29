# Proposal; role-registration-pipeline

## Why

Hoy ACADEMY_OWNER y PRODUCER se solicitan desde /perfil y SANDBOX da
acceso demo parcial; un flujo muerto que nadie usa. Producto quiere:
registro por landing con rol usable al instante (crear academia/eventos/
perfil) pero INVISIBLE al público hasta que admin valide el perfil.

## What Changes

- **Registro con rol**: CTAs de `/para-academias` y `/para-productores`
  → `/login?role=ACADEMY_OWNER|PRODUCER`. En el primer login se crea el
  `PersonRole` en `PENDING`. Esos dos roles dejan de ser `requestable`
  desde /perfil (solo landing o admin).
- **PENDING = usable, no visible**: el guard trata PENDING de esos dos
  roles como acceso a consola; visibilidad pública (directorio
  /academias, listados de eventos, actor en búsqueda/lineups) filtra por
  APPROVED.
- **SANDBOX eliminado**: del enum `RoleStatus` (migración), del
  `AllowSandbox` decorator, guard, y de toda referencia api/web/i18n.
  PersonRole con SANDBOX migran a PENDING.
- **/admin/perfiles-por-validar**: página dedicada; cola de PENDING
  (ACADEMY_OWNER/PRODUCER) con checklist de perfil completo (nombre,
  email verificado, teléfono, datos del actor completados) + aprobar
  (solo si completo) / rechazar.
- **Aprobación bloqueante por perfil**: admin no puede aprobar si falta
  algún dato del checklist (el API valida y el panel lo muestra).

## Capabilities

- **Modified**: `auth` (registro con rol), `rbac` (semántica PENDING,
  adiós SANDBOX), `admin` (cola de validación).
- **Nuevo**: `admin-validation-queue`.

## Impact

- Migración Prisma (drop SANDBOX de RoleStatus).
- API: roles.guard, roles.decorator, auth login/magic-link, academies
  (+payments gateway-accounts), admin/support/user-intel controllers,
  directorio público de academias y listados de eventos.
- Web: landings, /login, /perfil (requestRole fuera para esos roles),
  nueva página admin, i18n, nav admin.
- docs/qa-flows-inventory, openapi/postman.

## Decisión extra (usuario)

- **Pro bloqueado por aprobación**: `me.effectivePro` SHALL exigir
  `PersonRole.status === APPROVED`; un productor PENDING no puede
  comprar ni usar features Pro hasta que admin lo valide.
