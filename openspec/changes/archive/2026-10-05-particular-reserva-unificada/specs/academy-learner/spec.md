# Delta — academy-learner (particular-reserva-unificada)

## MODIFIED Requirements

### Requirement: Particulares del alumno dentro de reservadas

Las clases particulares del alumno SHALL aparecer en "Reservadas" de
`/clases` como una reserva más, sin bandeja ni fetch separado: el
mismo `GET /classes/mine` SHALL devolver las particulares activas
(REQUESTED/CONFIRMED) mergeadas en la respuesta con el shape del card
de clase (`series: null`, `date: null` cuando aún no se agenda) y
`GET /classes/mine?scope=past` SHALL incluir las terminales
(DONE/CANCELLED). El card SHALL ser el mismo `ClassCard` del resto
(título "Clase particular", badge de reservado, link a la ficha). Las
sin agendar SHALL agruparse al inicio bajo "Por agendar" — el pago
nunca queda invisible. Cancelar SHALL ocurrir dentro de la ficha
(`/clases/[id]`, que resuelve también particulares) como zona
destructiva con confirmación, igual que una reserva normal.

#### Scenario: Particular agendada entre reservas

- **GIVEN** alumno con una reserva de clase el lunes y una particular
  CONFIRMED el martes **WHEN** abre `/clases?scope=reservadas`
  **THEN** ambas aparecen en orden cronológico con el mismo card, la
  particular muestra academia e instructor.

#### Scenario: Particular por agendar

- **GIVEN** alumno que compró una particular aún sin asignar
  **WHEN** abre reservadas **THEN** la ve primero en el grupo "Por
  agendar" — el pago nunca queda invisible.

#### Scenario: Una sola llamada

- **WHEN** la vista reservadas carga **THEN** los items llegan en la
  respuesta de `GET /classes/mine` — sin fetch adicional de
  particulares desde la página. `GET /private-lessons/mine` queda
  reservado a la rama instructor (`?as=instructor`) — la lectura del
  alumno tiene una sola fuente.

#### Scenario: Cancelar desde la ficha

- **GIVEN** una particular activa del alumno **WHEN** abre su ficha
  `/clases/[id]` **THEN** ve academia, instructor (o "por asignar"),
  fecha (o "por agendar"), precio y estado, y **THEN** puede cancelar
  desde la zona destructiva al pie con confirmación — tras cancelar
  la ficha refleja CANCELLED.

#### Scenario: Sin bandeja separada

- **WHEN** el alumno navega `/clases/particular` **THEN** la ruta no
  existe; las notificaciones `academy.private_lesson.*` abren
  `/clases?scope=reservadas`.
