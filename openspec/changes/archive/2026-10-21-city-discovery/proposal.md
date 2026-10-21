# Change: city-discovery

## Por qué

Multipaís ya tiene `City` normalizada (`slug`, `lat/lng`, `timezone`,
`geohash`) y `Event.cityId`/`Venue.cityId` denormalizados — pero la
app sigue siendo mono-ciudad implícita: no hay forma de descubrir qué
hay en otra ciudad ni de encontrar actividades cerca de donde estás
parado. Task 7 del roadmap.

## Qué cambia

- **`GET /cities`** (público): ciudades con actividad próxima (count
  de eventos futuros), ordenadas por actividad.
- **`GET /cities/:slug`** (público): ficha de ciudad con nombre,
  país, próximos eventos (mismo shape que el feed), venues activos
  y flag `hasGuide`.
- **`GET /events/near?lat=&lng=&radiusKm=`** (público): resuelve las
  ciudades dentro del radio por lat/lng (haversine sobre
  `City.lat/lng`, default 25km) y devuelve eventos futuros con
  `cityId` en ese set — reusa el feed público existente.
- **Front**: `/(marketing)/ciudades` (directorio público con
  CTA por ciudad) + `/ciudades/[slug]` (landing: hero ciudad,
  próximos eventos, venues, link a guía si `hasGuide`); botón
  "Cerca de mí" en `/eventos` (geolocalización del browser →
  `GET /events/near`, manejo de permiso denegado con copy útil).
- **Gating**: todo detrás del flag `city_landing` (feature-flags;
  si está OFF el front no enlaza y los endpoints devuelven 404) —
  el seed lo deja ON.
- i18n `es-CL`; console-patterns no aplica (superficie pública);
  craft-floor impeccable.

## Fuera de scope

- Mapa interactivo (listas ordenadas por distancia bastan v1 —
  venue.lat/lng existe si se quiere después).
- Geohash matching a nivel DB (con ~20 ciudades el haversine en
  memoria es trivial; si el catálogo crece se baja a SQL/geohash
  prefix).
- "Mi ciudad" persistida (la tabla Person↔City que existe queda
  para mi-viaje/preferencias).
