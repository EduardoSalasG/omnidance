# Deltas: academies/staff-roles

## MODIFIED Requirements

### Requirement: Consola de instructor fuera de la lente owner

`/academia/clases` (consola "Mis clases" del instructor) MUST NOT
aparecer en la navegación del rol ACADEMY_OWNER (drawer móvil ni
sidebar desktop). Una persona navegando con la lente ACADEMY_OWNER que
llegue a esa ruta SHALL ser redirigida a `/inicio`. La lente INSTRUCTOR
(y quienes tengan ambos roles y la elijan) conserva el acceso.

La navegación del instructor SHALL reducirse a sus destinos operativos:
tab bar = Inicio, Mis clases (central) y Alumnos + Perfil. El hub
`/academia` ("Mi academia"), Clases particulares y Videos MUST NOT
aparecer en la navegación del instructor (tab bar, drawer ni sidebar);
las rutas siguen existiendo para owner/staff. El instructor MUST NOT
renderizar hamburguesa ni drawer overlay en `<lg` (mismo criterio que
DANCER: todo cabe en el tab bar); en `≥lg` la sidebar lista solo los
destinos de sus tabs + la sección Cuenta.

#### Scenario: owner entra a mis clases

- **GIVEN** una persona con rol ACADEMY_OWNER navegando con esa lente
- **WHEN** abre `/academia/clases`
- **THEN** es redirigida a `/inicio` y el drawer nunca lista el módulo

#### Scenario: instructor conserva la consola

- **GIVEN** una persona con lente INSTRUCTOR
- **WHEN** abre `/academia/clases`
- **THEN** ve sus clases asignadas como antes

#### Scenario: instructor navega a alumnos

- **GIVEN** una persona con lente INSTRUCTOR
- **WHEN** mira el tab bar
- **THEN** hay un tab "Alumnos" que abre `/academia/alumnos` y no existe
  tab "Mi academia"; en `<lg` no hay hamburguesa ni drawer

## ADDED Requirements

### Requirement: Alumnos consultables por el instructor

`GET /academies/:id/students` y `GET /academies/:id/students/:personId`
SHALL ser accesibles para cualquier `AcademyInstructor` de la academia
(vía `requireManage`), en modo solo-lectura: el instructor no puede
crear enrollments ni mutar `status`/`endsAt` (la capacidad `students`
sigue siendo de owner/staff). El listado SHALL soportar búsqueda por
nombre (`q`, ≥2 chars) y la ficha SHALL incluir el historial de clases
del alumno (`history`: `attended`/`booked`/`cancelled` sobre clases
pasadas) y sus próximas reservas (`upcoming`).

#### Scenario: instructor busca un alumno

- **GIVEN** un instructor de la academia A
- **WHEN** llama `GET /academies/A/students?q=mar`
- **THEN** recibe los enrollments de A cuyo nombre contiene "mar"
  (insensitive) y puede abrir la ficha con su historial de asistencias

#### Scenario: instructor no edita alumnos

- **GIVEN** un instructor de la academia A sin capacidad `students`
- **WHEN** llama `PATCH /enrollments/:id`
- **THEN** recibe 403
