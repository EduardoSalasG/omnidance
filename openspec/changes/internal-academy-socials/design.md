# Design: internal-academy-socials

## Modelo

`Event.visibility: EventVisibility` enum PUBLIC | INTERNAL_ACADEMY,
default PUBLIC. Constraint app-level: INTERNAL_ACADEMY ⇒ academyId
requerido. `academyId` YA existe en schema y el create/update de
evento ya lo acepta (events.controller.ts:1033,1105).

## Feed y descubrimiento

El feed público (mapPublicFeed) filtra `visibility=PUBLIC` para
viewers anónimos o sin enrollment en la academia del evento; con
sesión + enrollment ACTIVE del event.academyId → visible. /e/[id]:
404/unavailable para no-alumnos (no revelar existencia).

## Gate de compra

Checkout y reserva validan: event.visibility=INTERNAL_ACADEMY ⇒
existe Enrollment ACTIVE (personId, academyId=event.academyId) ⇒
403 "evento exclusivo para alumnos de la academia".

## Score

El compute del RelationshipScore (crm.service + crm-scores
.scheduler) suma la asistencia a INTERNAL_ACADEMY de la academia al
conteo de asistencia del eje ACADEMY. Eventos internos NO alimentan
el eje PRODUCER (dominio separado, doble conteo evitado).

## Idea anotada (futuro)

Congresos gestionados por la academia también podrían sumar al
score-academia (queda en docs/design-expansion-academia-2026-11.md).
