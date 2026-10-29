# rbac Specification

## Purpose
TBD - created by archiving change role-registration-pipeline. Update Purpose after archive.

## Requirements

### Requirement: ciclo de vida de rol

`RoleStatus` pasa a `{PENDING, APPROVED}`; se elimina SANDBOX y el
decorador `@AllowSandbox`. `PENDING` de ACADEMY_OWNER/PRODUCER SHALL
permitir operar su propia consola (crear academia/eventos, completar
perfil) pero SHALL NOT exponer al actor al público (directorio de
academias, listados de eventos, búsqueda/lineups) hasta `APPROVED`.
Esos dos roles SHALL NOT ser `requestable` desde `/perfil`; solo se
obtienen vía `?role=` en login desde las landings o por grant admin.

#### Scenario: owner pendiente crea pero no se ve

- **WHEN** un usuario registrado vía `/para-academias` (PENDING) crea
  su academia y la completa
- **THEN** puede operar `/academia` completa, pero la academia no
  aparece en el directorio público ni el actor en búsquedas hasta que
  admin apruebe

#### Scenario: solicitud interna bloqueada

- **WHEN** un bailarín intenta solicitar ACADEMY_OWNER desde /perfil
- **THEN** la API lo rechaza; el rol no es requestable en-app

### Requirement: checklist de validación visible al actor PENDING

`GET /me/role-checks` SHALL devolver, por cada PersonRole PENDING de un
rol de validación (ACADEMY_OWNER/PRODUCER), el mismo checklist que
evalúa la cola admin (nombre real, email verificado, teléfono, datos
del actor: academia o evento creado) y si está completo. La app SHALL
mostrar una card al actor con los ítems faltantes, cada uno enlazado a
la acción que lo resuelve (perfil/datos, consola del actor, verificación
de correo inline); el actor nunca ve "En revisión" sin saber qué falta.

#### Scenario: owner ve lo que le falta

- **WHEN** un ACADEMY_OWNER PENDING sin teléfono ni correo verificado
  abre su perfil o su home
- **THEN** la card lista "email verificado" (con CTA de verificación
  inline), "teléfono" (link a /perfil/datos) y "datos del actor"
  (link a /academia)

#### Scenario: checklist completo queda a la espera del admin

- **WHEN** todos los checks del rol PENDING pasan
- **THEN** la card indica que el perfil está completo y en espera de
  aprobación; sin ítems accionables

#### Scenario: sin roles pendientes no hay card

- **WHEN** la persona no tiene PersonRole PENDING de validación
- **THEN** la card no se renderiza
