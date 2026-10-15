## ADDED Requirements

### Requirement: Score en el listado de alumnos

`GET /academies/:id/students` SHALL incluir en cada ítem `score`
(number|null) y `segment` (string|null) leídos de `RelationshipScore`
con `actorType=ACADEMY, actorId=<id de la academia>, personId=<alumno>`.
Alumnos sin score computado SHALL responder `score: null,
segment: null`. El join SHALL resolverse en un solo query por los
personIds de la página (no N+1) y MUST NOT alterar el `total` ni el
orden vigente.

#### Scenario: fila con score

- **GIVEN** un alumno con RelationshipScore `score=72, segment=CORE`
  para la academia
- **WHEN** el owner lista `/academies/:id/students`
- **THEN** su ítem trae `score: 72, segment: "CORE"`

#### Scenario: fila sin score

- **GIVEN** un alumno que nunca fue recomputado
- **WHEN** se lista
- **THEN** su ítem trae `score: null, segment: null`
