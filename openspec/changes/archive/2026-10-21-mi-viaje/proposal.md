# Change: mi-viaje

## Por qué

Con discovery multipaís un bailarín que viaja puede encontrar qué
hay en otra ciudad; pero no puede *planear*: guardar los eventos
que le interesan de Santiago, Valparaíso y Buenos Aires en una sola
lista ordenada para armar su itinerario. "Mi viaje" es el trip
planner del roadmap (task 9): bookmark multipaís → itinerario.

## Qué cambia

- **`TripItem`** (nuevo modelo): `{personId, eventId, note?,
  addedAt}` único por (personId, eventId); la "lista de viaje" del
  bailarín. Sin Trip contenedor v1 (una lista por persona; el modelo
  deja la puerta a trips nombrados si el uso lo pide).
- **API** (SessionGuard, own-person): `GET /me/trip` devuelve los
  items con el evento expandido (shape feed + `city`) ordenados por
  fecha del evento, agrupable por ciudad en el front; `PUT
  /me/trip/:eventId {note?}` agrega/actualiza (idempotente);
  `DELETE /me/trip/:eventId` quita (404 si no estaba).
  `GET /events/:id` (o el feed) puede incluir `inTrip` para el
  viewer autenticado; decidir por el endpoint que el front ya
  consume para la ficha.
- **Front**: toggle "Guardar en Mi viaje" (bookmark) en la ficha
  del evento (`/eventos/[id]`); página `/mi-viaje` con el
  itinerario agrupado por ciudad → fecha, con nota editable inline,
  quitar por item, empty state con CTA al directorio de ciudades;
  contador en nav si el patrón lo permite sin ruido.
- **Gating**: flag `trip_planner` (seed ON); OFF → endpoints 404 y
  el front no muestra toggle ni entrada de nav.
- Migración + i18n es-CL + impeccable.

## Fuera de scope

- Itinerarios múltiples o nombrados, compartir el viaje,
  sugerencias automáticas, integración con calendario externo.
- Alertas de "tu viaje se acerca" (notificaciones; iteración).
