# Delta — academies/private-lesson-product (academy-console-v4)

La clase la marca realizada el instructor, no el owner; la asignación
ya no snapshottea comisión (acuerdo económico).

## MODIFIED Requirements

### Requirement: Asignación por el owner

`PATCH /private-lessons/:id` SHALL aceptar `action="assign"` con
`{instructorId, scheduledAt}`: solo owner/ADMIN, solo sobre lecciones en
`REQUESTED`; valida que el instructor pertenezca a la academia (404 si no);
setea instructor+fecha y transiciona a `CONFIRMED` **sin escribir
`commissionPct`** (las lecciones nuevas nacen en 0 — la liquidación
vigente es el acuerdo económico). SHALL notificar al alumno y al
instructor asignado.

#### Scenario: assign feliz

- **WHEN** el owner asigna instructor de la academia y fecha a una lección
  REQUESTED pagada
- **THEN** la lección queda CONFIRMED con `instructorId`, `scheduledAt` y
  `commissionPct=0`; alumno e instructor son notificados.

#### Scenario: assign sobre lección no REQUESTED

- **WHEN** se intenta assign sobre CONFIRMED/DONE/CANCELLED
- **THEN** responde 409.

#### Scenario: assign por instructor o alumno

- **WHEN** un instructor (no owner) o el alumno intentan assign
- **THEN** responde 403.

## ADDED Requirements

### Requirement: Realizada la marca el instructor

`PATCH /private-lessons/:id` con `action="done"` SHALL aceptarse solo
desde el instructor asignado a la lección (o un actor con `admin.access`
como escape operativo): la asistencia la acredita quien la dictó, no la
dirección de la academia. Sobre lecciones no `CONFIRMED` responde 409.

#### Scenario: instructor marca su clase

- **GIVEN** una lección CONFIRMED asignada al instructor
- **WHEN** el instructor hace `action="done"`
- **THEN** la lección queda DONE

#### Scenario: owner no marca realizada

- **WHEN** el owner de la academia intenta `action="done"` sobre una
  lección de su academia
- **THEN** responde 403 — el owner gestiona, no acredita asistencia

#### Scenario: admin como escape operativo

- **WHEN** un actor con `admin.access` hace `action="done"`
- **THEN** la lección queda DONE (resolución de incidencias)

## MODIFIED Requirements

### Requirement: Solicitud libre del alumno retirada

`POST /academies/:id/private-lessons` SHALL requerir gestión de la academia
(owner/ADMIN o instructor de ella) - el alumno externo ya no solicita;
compra. Listados SHALL tolerar `instructorId`/`scheduledAt` nulos sin
romper el shape (`instructor` puede ser null; la UI muestra "por
asignar"/"por agendar").

#### Scenario: alumno externo rechazado

- **WHEN** un usuario sin gestión de la academia hace POST
  /academies/:id/private-lessons
- **THEN** responde 403.

#### Scenario: staff crea lección manual

- **WHEN** el owner hace POST con instructorId+scheduledAt+price
- **THEN** se crea la lección REQUESTED con `commissionPct=0`.

#### Scenario: listado con lección sin asignar

- **WHEN** la academia tiene una PrivateLesson con instructorId/scheduledAt
  null
- **THEN** `GET /academies/:id/private-lessons` la incluye con
  `instructor: null` y `scheduledAt: null` sin error.
