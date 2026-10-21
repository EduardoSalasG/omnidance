# Tasks — city-discovery

- [x] 1. Backend: `cities.controller.ts` (público, flag `city_landing`
  gated): `GET /cities`, `GET /cities/:slug` (ficha + eventos futuros
  shape feed + venues + hasGuide si CityGuide/city.guide existe —
  si no, omite el campo) + `GET /events/near?lat&lng&radiusKm`
  (haversine sobre City.lat/lng → cityIds → eventos futuros
  publicados; nearestCity de sugerencia). Specs vitest.
- [x] 2. Front marketing: `/ciudades` directorio + `/ciudades/[slug]`
  landing (hero, lista de eventos reusa card existente, venues,
  enlace a guía). "Cerca de mí" en `/eventos` (geolocalización,
  permiso denegado → copy + fallback manual por ciudad). Todo gated
  por `city_landing` vía `useFeatures`. i18n es-CL. impeccable.
- [x] 3. architecture.md + qa-inventory + openapi regen (orquestador);
  validate + archive.
