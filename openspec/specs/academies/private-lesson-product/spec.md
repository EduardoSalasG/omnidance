# academies/private-lesson-product Specification

## Purpose
TBD - created by archiving change private-lesson-product. Update Purpose after archive.

## Requirements

### Requirement: Precio de particular por academia

`Academy.privateLessonPrice` SHALL ser el precio único de la clase
particular (CLP), editable por owner/ADMIN vía `PATCH
/academies/:id/settings` (entero ≥ 0; null desactiva la venta). `GET
/academies/:id/profile` SHALL exponerlo; la UI SHALL ofrecer la card
"Clase particular" solo cuando el precio está configurado y es > 0.

#### Scenario: owner configura el precio

- **WHEN** el owner hace PATCH settings `{privateLessonPrice: 40000}`
- **THEN** el perfil público de la academia expone `privateLessonPrice:
  40000` y el alumno puede comprarla.

#### Scenario: actor sin permiso

- **WHEN** un no-owner/no-admin intenta fijar `privateLessonPrice`
- **THEN** responde 403.

### Requirement: Asignación por el owner

`PATCH /private-lessons/:id` SHALL aceptar `action="assign"` con
`{instructorId, scheduledAt}`: solo owner/ADMIN, solo sobre lecciones en
`REQUESTED`; valida que el instructor pertenezca a la academia (404 si no);
setea instructor+fecha, snapshottea `AcademyInstructor.commissionPct` a la
lección y transiciona a `CONFIRMED`. SHALL notificar al alumno y al
instructor asignado.

#### Scenario: assign feliz

- **WHEN** el owner asigna instructor de la academia y fecha a una lección
  REQUESTED pagada
- **THEN** la lección queda CONFIRMED con `instructorId`, `scheduledAt` y
  `commissionPct` del instructor vigente; alumno e instructor son
  notificados.

#### Scenario: assign sobre lección no REQUESTED

- **WHEN** se intenta assign sobre CONFIRMED/DONE/CANCELLED
- **THEN** responde 409.

#### Scenario: assign por instructor o alumno

- **WHEN** un instructor (no owner) o el alumno intentan assign
- **THEN** responde 403.

### Requirement: Solicitud libre del alumno retirada

`POST /academies/:id/private-lessons` SHALL requerir gestión de la academia
(owner/ADMIN o instructor de ella) — el alumno externo ya no solicita;
compra. Listados SHALL tolerar `instructorId`/`scheduledAt` nulos sin
romper el shape (`instructor` puede ser null; la UI muestra "por
asignar"/"por agendar").

#### Scenario: alumno externo rechazado

- **WHEN** un usuario sin gestión de la academia hace POST
  /academies/:id/private-lessons
- **THEN** responde 403.

#### Scenario: staff crea lección manual

- **WHEN** el owner hace POST con instructorId+scheduledAt+price
- **THEN** se crea la lección REQUESTED con snapshot de comisión, como hoy.

#### Scenario: listado con lección sin asignar

- **WHEN** la academia tiene una PrivateLesson con instructorId/scheduledAt
  null
- **THEN** `GET /academies/:id/private-lessons` la incluye con
  `instructor: null` y `scheduledAt: null` sin error.
