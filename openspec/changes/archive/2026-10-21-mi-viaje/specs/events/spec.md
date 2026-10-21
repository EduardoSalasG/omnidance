# Delta: events (mi-viaje)

## ADDED Requirements

### Requirement: Lista de viaje del bailarín

`TripItem {personId, eventId, note?, addedAt}` SHALL persistir el
evento guardado por una persona, único por (personId, eventId).
`PUT /me/trip/:eventId {note?}` SHALL ser idempotente (upsert) y
rechazar 404 eventos inexistentes; `DELETE /me/trip/:eventId` SHALL
quitarlo (404 si no existía); `GET /me/trip` SHALL devolver los items
del usuario con el evento expandido (shape del feed + `city{name,
slug}`) ordenados por `Event.startsAt`, excluyendo eventos ya
pasados por defecto (`?includePast=true` los incluye). Todos gated
por flag `trip_planner` (OFF → 404).

#### Scenario: Guardar evento

- **WHEN** un bailarín guarda un evento de otra ciudad en su viaje
- **THEN** `TripItem` queda persistido y `GET /me/trip` lo muestra
  con su ciudad — re-PUT con nota distinta la actualiza sin duplicar

#### Scenario: Aislamiento por persona

- **WHEN** el usuario A guarda un evento
- **THEN** el `GET /me/trip` del usuario B no lo ve — todos los
  endpoints operan exclusivamente sobre `request.person.id`

### Requirement: Toggle y página de itinerario

La ficha de evento SHALL ofrecer "Guardar en Mi viaje" (toggle que
PUTea/DELETEa con estado visual inmediato — bookmark filled/outline)
cuando `trip_planner` está encendido y el usuario tiene sesión.
`/mi-viaje` SHALL mostrar el itinerario agrupado por ciudad y luego
por fecha, con nota editable inline por item, quitar por item, y
empty state con CTA al directorio de ciudades.

#### Scenario: Itinerario multipaís

- **WHEN** el usuario tiene eventos guardados en Santiago y
  Valparaíso
- **THEN** `/mi-viaje` los muestra agrupados por ciudad, cada grupo
  ordenado por fecha — el orden de ciudades por la fecha de su
  primer evento
