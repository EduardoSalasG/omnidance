## MODIFIED Requirements

### Requirement: Alumnos consultables por el instructor

`GET /academies/:id/students` y `GET /academies/:id/students/:personId`
SHALL ser accesibles para cualquier `AcademyInstructor` de la academia
(vía `requireManage`), en modo solo-lectura: el instructor no puede
crear enrollments ni mutar `status`/`endsAt` (la capacidad `students`
sigue siendo de owner/staff). El listado SHALL soportar búsqueda por
nombre (`q`, ≥2 chars) y la ficha SHALL incluir el historial de clases
del alumno (`history`: `attended`/`booked`/`cancelled` sobre clases
pasadas) y sus próximas reservas (`upcoming`).

La página `/academia/alumnos` con lente INSTRUCTOR MUST NOT mostrar el
strip de KPIs, la sección Insights (top asistencia / top pagadores),
el card de importación ni el CTA de nueva inscripción. Los filtros de
fecha MUST NOT aparecer en esta vista para ninguna lente (permanecen
disponibles en el motor de analítica).

Las restricciones de la lente INSTRUCTOR SHALL aplicar por lente
activa, no por los roles reales de la persona: quien posea además
ACADEMY_OWNER, ADMIN o una fila staff ve, bajo la lente INSTRUCTOR,
exactamente lo que vería un instructor puro. La única mutación
habilitada para la lente INSTRUCTOR es marcar asistencia, y el backend
solo la acepta para clases cuyo plantel lo incluye
(`POST /classes/:id/attendance` y `POST /academies/:id/attendance`
rechazan a quien no es instructor efectivo de la clase salvo ADMIN de
plataforma).

`GET /academies/:id/students/insights` MUST NOT exponer montos a quien
no tiene la capacidad `payments`: `topPayersMonth` SHALL devolverse
solo a owner/ADMIN/staff con `canPayments`; para el resto (incl.
instructor) SHALL responder `topPayersMonth: []`.

#### Scenario: instructor busca un alumno

- **GIVEN** un instructor de la academia A
- **WHEN** llama `GET /academies/A/students?q=mar`
- **THEN** recibe los enrollments de A cuyo nombre contiene "mar"
  (insensitive) y puede abrir la ficha con su historial de asistencias

#### Scenario: instructor no edita alumnos

- **GIVEN** un instructor de la academia A sin capacidad `students`
- **WHEN** llama `PATCH /enrollments/:id`
- **THEN** recibe 403

#### Scenario: vista de alumnos del instructor

- **GIVEN** una persona con lente INSTRUCTOR en `/academia/alumnos`
- **WHEN** la página carga
- **THEN** solo ve búsqueda + filtros (sin fechas) y la tabla de
  alumnos: sin KPIs, sin Insights, sin "Nueva inscripción" y sin
  "Importar alumnos"

#### Scenario: admin bajo la lente instructor

- **GIVEN** una persona con rol ADMIN navegando con la lente INSTRUCTOR
- **WHEN** abre `/academia/alumnos` o la ficha `/academia/alumnos/[id]`
- **THEN** ve la misma superficie que un instructor puro: sin KPIs ni
  Insights en el listado y sin el editor de estado/fecha en la ficha

#### Scenario: insights sin datos de pago para el instructor

- **GIVEN** un instructor de la academia A sin capacidad `payments`
- **WHEN** llama `GET /academies/A/students/insights`
- **THEN** recibe `topAttendance` con datos y `topPayersMonth: []`

#### Scenario: staff con payments ve el ranking de pagos

- **GIVEN** un staff de la academia A con `canPayments`
- **WHEN** llama `GET /academies/A/students/insights`
- **THEN** recibe `topPayersMonth` con el top 5 por monto del mes
