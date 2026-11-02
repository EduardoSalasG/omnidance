# internal-academy-socials

## Why

Academias que también producen quieren sociales SOLO para sus
alumnos (community building). El alumno que asiste suma al score
de relación con ESA academia. Si el actor es solo productor nada
cambia; si es academia+productor, el score-academia incluye sus
sociales propios. Diseño aprobado en docs/design-expansion-academia
-2026-11.md sección 3.

## What Changes

- `Event.visibility` enum: PUBLIC (default) | INTERNAL_ACADEMY.
  Interno requiere `academyId` set.
- Creación/edición (productor que también es owner de academia):
  flag "solo alumnos de mi academia" → INTERNAL_ACADEMY.
- Feed/búsquedas/landing /e: excluir internos salvo enrollments
  ACTIVE de la academia (viewer con sesión).
- Gate de compra/checkin: ticket/reserva solo con enrollment
  ACTIVE de la academia → error claro para el resto.
- Score: asistencia a sociales internos de la academia alimenta el
  RelationshipScore actorType=ACADEMY de esa persona (misma
  dimensión de asistencia existente). Score-PRODUCER no se toca.

## Capabilities

### New Capabilities

- `events/internal-socials`: sociales internos de academia y su
  efecto en score-academia.

## Impact

- Schema: Event.visibility + migración.
- API: feed filter, create/update evento, checkout gate, score.
- Web: flag en form de evento del productor (solo si el actor es
  también owner de academia), mensaje de exclusividad.
