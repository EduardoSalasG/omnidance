# academy-learner — deltas (particulares-en-reservadas)

## ADDED Requirements

### Requirement: Particulares del alumno dentro de reservadas

Las clases particulares del alumno SHALL aparecer en "Reservadas" de
`/clases` como un item más, sin bandeja ni página separada. Las
agendadas (REQUESTED/CONFIRMED con `scheduledAt`) SHALL intercalarse
por fecha entre las reservas de clase (lista y calendario); las
compradas sin asignar SHALL agruparse al inicio con estado "por
agendar". La card SHALL mostrar academia, instructor (o "por asignar"),
estado y acción cancelar mientras la clase esté activa
(REQUESTED/CONFIRMED). Las particulares DONE/CANCELLED SHALL aparecer
en el scope historial.

#### Scenario: Particular agendada entre reservas

- **GIVEN** alumno con una reserva de clase el lunes y una particular
  CONFIRMED el martes **WHEN** abre `/clases?scope=reservadas`
  **THEN** ambas aparecen en orden cronológico, la particular con su
  academia, instructor y estado.

#### Scenario: Particular por agendar

- **GIVEN** alumno que compró una particular aún sin asignar
  **WHEN** abre reservadas **THEN** la ve primero con estado "por
  agendar" — el pago nunca queda invisible.

#### Scenario: Sin bandeja separada

- **WHEN** el alumno navega `/clases/particular` **THEN** la ruta no
  existe; las notificaciones `academy.private_lesson.*` abren
  `/clases?scope=reservadas`.
