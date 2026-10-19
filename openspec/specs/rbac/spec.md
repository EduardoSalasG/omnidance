# rbac Specification

## Purpose
TBD - created by archiving change role-registration-pipeline. Update Purpose after archive.

## Requirements

### Requirement: ciclo de vida de rol

`RoleStatus` pasa a `{PENDING, APPROVED}` — se elimina SANDBOX y el
decorador `@AllowSandbox`. `PENDING` de ACADEMY_OWNER/PRODUCER SHALL
permitir operar su propia consola (crear academia/eventos, completar
perfil) pero SHALL NOT exponer al actor al público (directorio de
academias, listados de eventos, búsqueda/lineups) hasta `APPROVED`.
Esos dos roles SHALL NOT ser `requestable` desde `/perfil` — solo se
obtienen vía `?role=` en login desde las landings o por grant admin.

#### Scenario: owner pendiente crea pero no se ve

- **WHEN** un usuario registrado vía `/para-academias` (PENDING) crea
  su academia y la completa
- **THEN** puede operar `/academia` completa, pero la academia no
  aparece en el directorio público ni el actor en búsquedas hasta que
  admin apruebe

#### Scenario: solicitud interna bloqueada

- **WHEN** un bailarín intenta solicitar ACADEMY_OWNER desde /perfil
- **THEN** la API lo rechaza — el rol no es requestable en-app
