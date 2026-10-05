# event-ratings

## Purpose

Evaluación privada del evento con atribución separada por actor: cada dimensión alimenta el ranking de quien es realmente responsable (música→DJ, ocupación/organización→productor, pista/temperatura/iluminación→venue) — spec §5.

## ADDED Requirements

### Requirement: Evaluar el evento

El sistema SHALL permitir a asistentes con check-in validado evaluar el evento en sus dimensiones, editable dentro de la ventana post-evento (~24h). Sin texto libre — solo puntajes 1-5.

#### Scenario: evaluación de asistente

- **WHEN** una persona con check-in válido en el evento envía `POST /events/:id/ratings` con puntajes de dimensión
- **THEN** el sistema guarda la evaluación (upsert por rater) y responde 200

#### Scenario: sin check-in no evalúa

- **WHEN** una persona sin check-in en el evento intenta evaluarlo
- **THEN** el sistema responde 403

#### Scenario: ventana cerrada

- **WHEN** pasaron más de ~24h desde el cierre del evento
- **THEN** el sistema responde 409 y la evaluación queda bloqueada

### Requirement: Atribución por actor

Cada dimensión SHALL agregarse al actor responsable: `music`→DJ, `occupation`+`organization`→productor, `floorComfort`+`temperature`+`lightingSound`→venue. Nunca se exponen evaluaciones individuales ni quién evaluó.

#### Scenario: agregado para el productor

- **WHEN** el productor del evento (o admin) consulta `GET /events/:id/ratings/summary`
- **THEN** recibe promedios y conteos por dimensión agrupados por actor responsable — sin datos del evaluador

#### Scenario: sin evaluaciones suficientes

- **WHEN** el evento tiene menos del umbral de agregación de evaluaciones
- **THEN** el resumen responde con conteos y promedios nulos/no expuestos (k-anonymity)
