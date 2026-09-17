# song-suggestions

## Purpose

Sugerencia de canción opcional en el checkout de preventa, agregada como top-N para el DJ y el productor — habilita el momento "la canción más pedida suena a las X" (spec §8, §13 DJ, decisión §18: 1 por ticket, deduplicada por canción).

## ADDED Requirements

### Requirement: Sugerir canción en el checkout

El sistema SHALL aceptar un campo opcional `songSuggestion` al crear el checkout de ticket. La sugerencia queda ligada al comprador y al evento — máximo una por ticket.

#### Scenario: sugerencia con checkout

- **WHEN** el comprador envía `POST /checkout/ticket` con `songSuggestion` no vacío
- **THEN** al confirmarse el pago la sugerencia queda registrada para el evento (1 por ticket)

#### Scenario: sin sugerencia

- **WHEN** el checkout no incluye `songSuggestion`
- **THEN** el flujo procede idéntico sin crear sugerencia

#### Scenario: sugerencia solo cuenta con ticket pagado

- **WHEN** el pago queda FAILED o nunca se confirma
- **THEN** la sugerencia no aparece en el top-N del evento

### Requirement: Top-N para DJ y productor

El sistema SHALL exponer el ranking de canciones más pedidas del evento, deduplicado por texto de canción normalizado, accesible al productor del evento, sus DJs asignados y admin.

#### Scenario: ranking agregado

- **WHEN** el productor o un DJ del evento consulta `GET /events/:id/song-suggestions`
- **THEN** recibe la lista ordenada por cantidad de pedidos (canción + conteo), top-N

#### Scenario: acceso restringido

- **WHEN** un bailarín sin relación con el evento consulta el ranking
- **THEN** el sistema responde 403
