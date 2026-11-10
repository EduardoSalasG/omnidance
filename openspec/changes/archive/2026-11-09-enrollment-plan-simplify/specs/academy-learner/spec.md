# Delta: academy-learner

## MODIFIED Requirements

### Requirement: El alumno explora clases priorizando sus academias

`GET /classes/browse` SHALL aceptar `scope=enrolled` para acotar el listado a las academias donde el autenticado tiene Enrollment `ACTIVE` (`INACTIVE` no cuenta). Sin `scope` mantiene `all` (todas las academias activas). Cada item SHALL incluir `enrolled: boolean` - vigencia de inscripción del autenticado en la academia de la clase - para resolver el CTA de reserva sin query extra.

#### Scenario: Alumno inscrito en una academia

- WHEN un dancer con Enrollment ACTIVE en academia A consulta `/classes/browse?scope=enrolled`
- THEN recibe solo clases de academia A, cada una con `enrolled: true`

#### Scenario: Alumno sin inscripciones vigentes

- WHEN un dancer con Enrollment INACTIVE (o sin enrollments) consulta `/classes/browse?scope=enrolled`
- THEN recibe `[]`

#### Scenario: Explorar todas las academias

- WHEN un dancer consulta `/classes/browse` sin `scope`
- THEN recibe clases de todas las academias activas; las de academias sin inscripción vigente llegan con `enrolled: false`

### Requirement: Reservar clase exige inscripción vigente

`POST /classes/:id/book` SHALL verificar que el autenticado tenga Enrollment `ACTIVE` en la academia de la clase; sin ella responde `403` sin crear ni reactivar reserva. `GET /classes/:id` SHALL incluir `enrolled: boolean` con la misma regla, para que la ficha y el CTA reflejen la elegibilidad.

#### Scenario: Reserva con inscripción vigente

- WHEN un alumno con Enrollment ACTIVE en la academia de la clase hace POST /classes/:id/book
- THEN se crea la reserva (BOOKED o WAITLIST según cupo) como hoy

#### Scenario: Reserva sin inscripción vigente

- WHEN un alumno sin Enrollment vigente en la academia de la clase hace POST /classes/:id/book
- THEN recibe 403 y no se crea ni modifica ninguna reserva

#### Scenario: Reserva con inscripción pausada

- WHEN un alumno con Enrollment INACTIVE (ex "pausada") en la academia hace POST /classes/:id/book
- THEN recibe 403
