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
con acuerdo COMMISSION o históricas del modelo anterior). En lecciones
sin comisión (`commissionPct=0`) esos campos SHALL NO aparecer — un
`netClp` igual al precio sugeriría que el instructor cobra el total.
La rama `as=student` ya no existe en este endpoint (la vista del
alumno vive en `/classes/mine`).

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
con `{payType?: "PER_CLASS"|"MONTHLY"|"COMMISSION"|null, payAmount?:
int≥0, payClasses?: int≥0, commissionPct?: int 0-100}` que actualiza el
acuerdo económico del `AcademyInstructor`. Solo owner de la academia o
`admin.access`. Un solo subtipo SHALL estar activo por fila:
`COMMISSION` usa `commissionPct` y limpia `payAmount`/`payClasses`;
`PER_CLASS`/`MONTHLY` limpian `commissionPct`; `payType=null` limpia
todos los campos económicos.

#### Scenario: owner fija el acuerdo

- **GIVEN** un AcademyInstructor `(academyId, personId)` existente
- **WHEN** el owner hace `PATCH` con `{payType: "PER_CLASS",
  payAmount: 15000}`
- **THEN** el instructor queda con ese acuerdo y la respuesta lo incluye

#### Scenario: owner fija acuerdo a comisión

- **WHEN** el owner hace `PATCH` con `{payType: "COMMISSION",
  commissionPct: 30}`
- **THEN** el instructor queda con `commissionPct=30` y
  `payAmount`/`payClasses` en null

#### Scenario: cambiar de subtipo limpia los campos incompatibles

- **GIVEN** un instructor con `payType=COMMISSION, commissionPct=30`
- **WHEN** el owner hace `PATCH` con `{payType: "PER_CLASS",
  payAmount: 15000}`
- **THEN** `commissionPct` queda en null y `payAmount=15000`

#### Scenario: rechazos

- **WHEN** el solicitante es instructor de la academia pero no owner → 403
- **WHEN** `(academyId, personId)` no existe como instructor → 404
- **WHEN** `payType` sale del whitelist → 400
- **WHEN** `commissionPct` no es entero entre 0 y 100 → 400

### Requirement: Snapshot de comisión según el acuerdo vigente

`POST /academies/:id/private-lessons` y `PATCH /private-lessons/:id`
con `action="assign"` SHALL snapshotear `commissionPct` en la lección
cuando el acuerdo del instructor asignado es `COMMISSION`; con cualquier
otro subtipo (o sin acuerdo) la lección nace con `commissionPct=0`.
`commissionPct`/`commissionPaidAt` en la lección describen el acuerdo
**al momento del snapshot** y SHALL NOT reescribirse si el acuerdo
cambia después. `action="pay-commission"` SHALL seguir liquidando solo
lecciones con `commissionPct > 0` (rechaza 409 las demás) y el filtro
`commission` SHALL seguir implicando `commissionPct > 0` — las
lecciones sin comisión no son "pendientes de comisión".

#### Scenario: lección de instructor a comisión

- **GIVEN** un instructor con `payType=COMMISSION, commissionPct=25`
- **WHEN** se crea o asigna una `PrivateLesson` a ese instructor
- **THEN** la lección queda con `commissionPct=25`

#### Scenario: lección de instructor con acuerdo fijo

- **GIVEN** un instructor con `payType=PER_CLASS` (o `MONTHLY`, o sin
  acuerdo, o con `commissionPct` histórico pero `payType` distinto de
  `COMMISSION`)
- **WHEN** se crea o asigna una `PrivateLesson` a ese instructor
- **THEN** la lección queda con `commissionPct=0`

#### Scenario: liquidación sigue viva

- **GIVEN** una lección CONFIRMED con `commissionPct=25` y
  `commissionPaidAt=null`
- **WHEN** el owner hace `action="pay-commission"`
- **THEN** marca `commissionPaidAt` y notifica al instructor
- **WHEN** se intenta sobre una lección con `commissionPct=0`
- **THEN** responde 409 "sin comisión pendiente"

#### Scenario: filtro commission=pending

- **GIVEN** lecciones con `commissionPct=25` sin liquidar y lecciones
  con `commissionPct=0`
- **WHEN** se filtra `commission=pending`
- **THEN** solo aparecen las con comisión sin liquidar

### Requirement: Vista staff expone el acuerdo completo

`GET /academies/:id` (vista manage) SHALL incluir en `academy.
instructors` el acuerdo (`payType`/`payAmount`/`payClasses`) y SHALL
NO exponer `commissionPct`. Los listados/detalle de profesores bajo la
capacidad `team` SHALL exponer `commissionPct` con valor solo cuando el
`payType` vigente es `COMMISSION` (null en otro subtipo — la tasa de
un acuerdo que no es comisión no se presenta como vigente). Los
listados/detalles de clases particulares SHALL incluir `commissionPct`/
`commissionPaidAt` solo en filas con `commissionPct > 0` para quien
puede ver la comisión (owner/ADMIN o el instructor de la clase).
`GET /academies/:id/profile` SHALL NO exponer el acuerdo ni la
comisión.

#### Scenario: detalle manage sin comisión

- **WHEN** owner/instructor consulta `GET /academies/:id`
- **THEN** cada instructor incluye el acuerdo económico y no expone
  `commissionPct`

#### Scenario: profesor a comisión en el listado de equipo

- **GIVEN** un instructor con `payType=COMMISSION, commissionPct=30`
- **WHEN** un gestor con capacidad `team` lista los instructores
- **THEN** la fila incluye `commissionPct=30`
- **WHEN** el instructor tiene `payType=PER_CLASS`
- **THEN** la fila incluye `commissionPct=null`

#### Scenario: fila de lección con comisión muestra los campos

- **GIVEN** una lección con `commissionPct=25`
- **WHEN** el owner consulta el listado o detalle
- **THEN** la fila incluye `commissionPct` y `commissionPaidAt`
- **WHEN** la lección tiene `commissionPct=0`
- **THEN** la fila no incluye esos campos
