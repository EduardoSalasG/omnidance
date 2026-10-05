# academies/instructor-commission Specification

## Purpose
El instructor ve cuánto le corresponde de cada clase particular y el
owner configura la comisión que retiene la academia - hoy
`PrivateLesson.commissionPct` existe pero nadie lo puebla ni lo muestra.

## Requirements

### Requirement: Comisión configurable por instructor

El sistema SHALL exponer `PATCH /academies/:id/instructors/:personId`
con `{commissionPct: 0..100}` que actualiza `AcademyInstructor.
commissionPct`. Solo owner de la academia o `admin.access`.

#### Scenario: owner fija la comisión

- **GIVEN** un AcademyInstructor `(academyId, personId)` existente
- **WHEN** el owner hace `PATCH` con `{commissionPct: 30}`
- **THEN** el instructor queda con `commissionPct=30`

#### Scenario: rechazos

- **WHEN** el solicitante es instructor de la academia pero no owner → 403
- **WHEN** `(academyId, personId)` no existe como instructor → 404
- **WHEN** `commissionPct` falta, no es entero o sale de 0–100 → 400

### Requirement: Snapshot al solicitar

`POST /academies/:id/private-lessons` SHALL copiar el `commissionPct`
vigente del `AcademyInstructor` a `PrivateLesson.commissionPct` (null →
0). Cambios posteriores del owner no afectan lecciones ya creadas.

#### Scenario: lección con instructor comisionado

- **GIVEN** un instructor con `commissionPct=25`
- **WHEN** un alumno solicita una clase particular con `price=40000`
- **THEN** la `PrivateLesson` se crea con `commissionPct=25`
- **AND** si el owner luego sube la comisión a 40, la lección conserva 25

### Requirement: Neto visible para el instructor

`GET /private-lessons/mine?as=instructor` SHALL agregar por fila
`commissionClp = round(price * commissionPct / 100)` y
`netClp = price - commissionClp`. La rama `as=student` (default) SHALL
NO exponer `commissionClp`/`netClp` ni `commissionPct`.

#### Scenario: instructor revisa su neto

- **GIVEN** una lección `price=40000, commissionPct=25` del instructor
- **WHEN** consulta `mine?as=instructor`
- **THEN** la fila incluye `commissionClp=10000, netClp=30000`

#### Scenario: alumno no ve comisión

- **WHEN** el alumno consulta `mine` (sin `as`)
- **THEN** la fila no incluye `commissionPct`, `commissionClp` ni `netClp`

### Requirement: Vista staff expone la comisión

`GET /academies/:id` (vista manage, requireManage) SHALL incluir
`commissionPct` en `academy.instructors`. `GET /academies/:id/profile`
(vista pública) SHALL NO exponerlo.

#### Scenario: detalle manage con comisión

- **WHEN** owner/instructor consulta `GET /academies/:id`
- **THEN** cada instructor incluye `personId` y `commissionPct`

#### Scenario: perfil público sin comisión

- **WHEN** cualquier autenticado consulta `GET /academies/:id/profile`
- **THEN** los instructores no exponen `commissionPct`
