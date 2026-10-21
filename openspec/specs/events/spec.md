# events Specification

## Purpose
TBD - created by archiving change city-discovery. Update Purpose after archive.

## Requirements

### Requirement: Directorio y landing de ciudades

`GET /cities` SHALL devolver las ciudades con al menos un evento
futuro publicado, con `{id, slug, name, country, upcomingEvents}` y
orden por actividad descendente. `GET /cities/:slug` SHALL devolver
la ficha `{id, slug, name, country, lat, lng, upcomingEvents:
EventFeedItem[], venues: {id,name}[], hasGuide}` o 404 si el slug no
existe. Ambos endpoints SHALL respetar el flag `city_landing` (apagado
→ 404).

#### Scenario: Ciudad sin actividad

- **WHEN** una ciudad existe pero no tiene eventos futuros
- **THEN** no aparece en `GET /cities` y `GET /cities/:slug`
  responde con `upcomingEvents: []` y `hasGuide` según corresponda

### Requirement: Búsqueda "cerca de mí"

`GET /events/near?lat=<f>&lng=<f>&radiusKm=<n>` SHALL devolver los
eventos futuros publicados cuya `cityId` pertenece a una ciudad con
`lat/lng` dentro del radio (haversine; `radiusKm` default 25, máx 200),
con el mismo shape del feed público y ordenados por distancia de la
ciudad. Sin `lat`/`lng` válidas → 400. Si ninguna ciudad con
coordenadas cae en el radio → `{events: [], nearestCity?: {...}}` con
la ciudad más cercana si existe (sugerencia, nunca error).

#### Scenario: Usuario en Santiago

- **WHEN** un visitante consulta near con coordenadas de Santiago
  (`-33.45,-70.66`)
- **THEN** recibe los eventos futuros de `city-stgo-cl` ordenados por
  fecha, con `nearestCity` innecesario

#### Scenario: Lejos de toda ciudad

- **WHEN** las coordenadas están a >500km de toda ciudad
- **THEN** `events:[]` y `nearestCity` apunta a la más cercana

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
