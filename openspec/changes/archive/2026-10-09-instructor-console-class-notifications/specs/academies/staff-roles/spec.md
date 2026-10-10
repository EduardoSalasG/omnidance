# Delta: academies/staff-roles

## MODIFIED Requirements

### Requirement: Consola de instructor fuera de la lente owner

`/academia/clases` (consola "Mis clases" del instructor) MUST NOT
aparecer en la navegación del rol ACADEMY_OWNER (drawer móvil ni
sidebar desktop). Una persona navegando con la lente ACADEMY_OWNER que
llegue a esa ruta SHALL ser redirigida a `/inicio`. La lente INSTRUCTOR
(y quienes tengan ambos roles y la elijan) conserva el acceso.

La navegación del instructor SHALL reducirse a sus destinos operativos:
tab bar = Inicio, Mis clases, Alumnos y Perfil. "Mis clases" SHALL ser
un tab normal — MUST NOT renderizarse como acción central destacada
(`center`): hereda el estilo de los demás tabs y solo se acentúa cuando
está activo. El hub `/academia` ("Mi academia"), Clases particulares y
Videos MUST NOT aparecer en la navegación del instructor (tab bar,
drawer ni sidebar); las rutas siguen existiendo para owner/staff.

El instructor MUST NOT renderizar hamburguesa ni drawer overlay en
`<lg` (mismo criterio que DANCER: todo cabe en el tab bar). En `≥lg`
el instructor MUST NOT renderizar sidebar — el tab bar inferior sigue
visible en todos los breakpoints como su única navegación, y el
contenido no reserva el padding lateral de la sidebar.

`/academia/clases` SHALL mostrar solo el listado de clases del
instructor: MUST NOT renderizar el strip de KPIs de academia
(`AcademyKpiStrip`).

El home del instructor MUST NOT mostrar la card "Mi academia"; SHALL
mostrar una sección "Próximas clases" con las próximas clases que dicta
(reuso de la card de clase del home del alumno) enlazando a
`/academia/clases/:id`.

#### Scenario: owner entra a mis clases

- **GIVEN** una persona con rol ACADEMY_OWNER navegando con esa lente
- **WHEN** abre `/academia/clases`
- **THEN** es redirigida a `/inicio` y el drawer nunca lista el módulo

#### Scenario: instructor conserva la consola

- **GIVEN** una persona con lente INSTRUCTOR
- **WHEN** abre `/academia/clases`
- **THEN** ve sus clases asignadas sin strip de KPIs

#### Scenario: instructor navega a alumnos

- **GIVEN** una persona con lente INSTRUCTOR
- **WHEN** mira el tab bar
- **THEN** hay un tab "Alumnos" que abre `/academia/alumnos`, no existe
  tab "Mi academia", "Mis clases" es un tab normal (no central verde) y
  en `<lg` no hay hamburguesa ni drawer

#### Scenario: instructor en desktop sin sidebar

- **GIVEN** una persona con lente INSTRUCTOR en viewport ≥lg
- **WHEN** carga cualquier página de la app
- **THEN** no hay sidebar lateral ni padding lateral reservado; el tab
  bar inferior (Inicio, Mis clases, Alumnos, Perfil) es la navegación

#### Scenario: home del instructor

- **GIVEN** una persona con lente INSTRUCTOR en `/inicio`
- **WHEN** la página carga
- **THEN** no hay card "Mi academia" y la sección "Próximas clases"
  lista las próximas clases que dicta, cada una enlazando a su roster

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
