# Tasks — mi-viaje

- [x] 1. Schema `TripItem` + migración (orquestador).
- [x] 2. API: `GET /me/trip` (+expansión evento feed-shape + city,
  orden por startsAt, `?includePast`), `PUT /me/trip/:eventId
  {note?}` (upsert idempotente, 404 evento), `DELETE
  /me/trip/:eventId`; `inTrip` para el viewer en la ficha de evento
  donde el front ya la consulta; gate flag `trip_planner`. Specs.
- [x] 3. Front: toggle bookmark en `/eventos/[id]` (estado optimista
  + revert en error, gated por flag + sesión); página `/mi-viaje`
  agrupada ciudad→fecha (nota inline editable, quitar, empty con
  CTA a /ciudades, skeleton); entrada en nav (donde el drawer
  agrupa consumo del bailarín). i18n es-CL, impeccable.
- [x] 4. architecture.md + qa-inventory + openapi regen; validate +
  archive (orquestador).
