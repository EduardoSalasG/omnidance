# academies/instructor-commission Specification

## Purpose
El instructor ve cuánto le corresponde de cada clase particular y el
owner configura la comisión que retiene la academia - hoy
`PrivateLesson.commissionPct` existe pero nadie lo puebla ni lo muestra.

## Requirements

### Requirement: Neto visible para el instructor

`GET /private-lessons/mine?as=instructor` SHALL agregar `commissionClp`
= round(price * commissionPct / 100)` y `netClp = price -
commissionClp` únicamente en filas con `commissionPct > 0` (lecciones
históricas). En lecciones nuevas (`commissionPct=0`) esos campos SHALL
NO aparecer — un `netClp` igual al precio sugeriría que el instructor
cobra el total. La rama `as=student` ya no existe en este endpoint
(la vista del alumno vive en `/classes/mine`).

#### Scenario: instructor revisa su neto

- **GIVEN** una lección `price=40000, commissionPct=25` del instructor
- **WHEN** consulta `mine?as=instructor`
- **THEN** la fila incluye `commissionClp=10000, netClp=30000`

#### Scenario: lección de acuerdo sin neto de comisión

- **GIVEN** una lección `price=40000, commissionPct=0` del instructor
- **WHEN** consulta `mine?as=instructor`
- **THEN** la fila NO incluye `commissionClp` ni `netClp`

#### Scenario: alumno no ve comisión

- **WHEN** el alumno consulta su historial vía `/classes/mine`
- **THEN** la fila no incluye `commissionPct`, `commissionClp` ni
  `netClp`

### Requirement: Acuerdo económico configurable por instructor

El sistema SHALL exponer `PATCH /academies/:id/instructors/:personId`
con `{payType?: "PER_CLASS"|"MONTHLY"|null, payAmount?: int≥0,
payClasses?: int≥0}` que actualiza el acuerdo económico del
`AcademyInstructor`. Solo owner de la academia o `admin.access`.
`commissionPct` SHALL NO ser aceptado ni expuesto por este contrato —
la columna persiste como histórico.

#### Scenario: owner fija el acuerdo

- **GIVEN** un AcademyInstructor `(academyId, personId)` existente
- **WHEN** el owner hace `PATCH` con `{payType: "PER_CLASS",
  payAmount: 15000}`
- **THEN** el instructor queda con ese acuerdo y la respuesta lo incluye

#### Scenario: rechazos

- **WHEN** el solicitante es instructor de la academia pero no owner → 403
- **WHEN** `(academyId, personId)` no existe como instructor → 404
- **WHEN** `payType` sale del whitelist → 400

### Requirement: Sin snapshot de comisión en lecciones nuevas

`POST /academies/:id/private-lessons` y `PATCH /private-lessons/:id`
con `action="assign"` SHALL NO escribir `commissionPct` — las lecciones
nuevas nacen con el default 0 y su liquidación se rige por el acuerdo
económico. `commissionPct`/`commissionPaidAt` persisten en schema como
histórico y `action="pay-commission"` SHALL seguir liquidando solo
lecciones con `commissionPct > 0` (rechaza 409 las nuevas). El filtro
`commission` de `GET /academies/:id/private-lessons` SHALL operar solo
sobre el histórico: `paid`/`pending` implican `commissionPct > 0` —
las lecciones nuevas no son "pendientes de comisión".

#### Scenario: lección nueva sin comisión

- **GIVEN** un instructor cuya columna `commissionPct` persiste como
  histórico
- **WHEN** se crea o asigna una `PrivateLesson`
- **THEN** la lección queda con `commissionPct = 0`

#### Scenario: liquidación histórica sigue viva

- **GIVEN** una lección CONFIRMED con `commissionPct=25` y
  `commissionPaidAt=null`
- **WHEN** el owner hace `action="pay-commission"`
- **THEN** marca `commissionPaidAt` y notifica al instructor
- **WHEN** se intenta sobre una lección con `commissionPct=0`
- **THEN** responde 409 "sin comisión pendiente"

#### Scenario: filtro commission=pending

- **GIVEN** lecciones históricas con `commissionPct=25` sin liquidar y
  lecciones nuevas con `commissionPct=0`
- **WHEN** se filtra `commission=pending`
- **THEN** solo aparecen las históricas sin liquidar

### Requirement: Vista staff expone el acuerdo, no la comisión

`GET /academies/:id` (vista manage) SHALL incluir en `academy.
instructors` el acuerdo (`payType`/`payAmount`/`payClasses`) y SHALL
NO exponer `commissionPct`. Los listados/detalles de clases
particulares solo SHALL incluir `commissionPct`/`commissionPaidAt` en
filas históricas (`> 0`) para quien puede ver la comisión (owner/ADMIN
o el instructor de la clase). `GET /academies/:id/profile` SHALL NO
exponer el acuerdo ni la comisión.

#### Scenario: detalle manage sin comisión

- **WHEN** owner/instructor consulta `GET /academies/:id`
- **THEN** cada instructor incluye el acuerdo económico y no expone
  `commissionPct`

#### Scenario: fila histórica sí muestra comisión

- **GIVEN** una lección con `commissionPct=25`
- **WHEN** el owner consulta el listado o detalle
- **THEN** la fila incluye `commissionPct` y `commissionPaidAt`
- **WHEN** la lección tiene `commissionPct=0`
- **THEN** la fila no incluye esos campos
