# Delta; events/internal-socials

## ADDED Requirements

### Requirement: Social interno solo para alumnos de la academia

Un evento con `visibility=INTERNAL_ACADEMY` SHALL excluirse de feed
público, búsquedas y landing /e para viewers sin enrollment ACTIVE
en `event.academyId`; la compra/reserva de tickets SHALL rechazar a
quienes no sean alumnos activos de esa academia.

#### Scenario: Alumno de la academia compra su social

- **WHEN** una persona con enrollment ACTIVE abre el link del social
  interno
- **THEN** ve la ficha completa y puede comprar entrada

#### Scenario: No-alumno intenta comprar

- **WHEN** una persona sin enrollment ACTIVE de la academia intenta
  comprar o reservar ticket del social interno
- **THEN** se rechaza con mensaje de evento exclusivo de la academia

### Requirement: Asistencia a social interno alimenta score-academia

La asistencia validada a un evento `INTERNAL_ACADEMY` SHALL contar
en la dimensión de asistencia del RelationshipScore
actorType=ACADEMY de esa persona hacia esa academia. No SHALL
alterar el RelationshipScore actorType=PRODUCER.

#### Scenario: Check-in en social interno

- **WHEN** un alumno hace check-in en el social interno de su academia
- **THEN** su score-academia con esa academia lo refleja en la
  dimensión de asistencia y su score-producer no cambia por ello
