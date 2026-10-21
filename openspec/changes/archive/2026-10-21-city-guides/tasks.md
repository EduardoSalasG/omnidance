# Tasks — city-guides

- [x] 1. Schema `CityGuide` + migración (orquestador).
- [x] 2. API: `GET/PUT /admin/city-guides` + `GET /admin/city-guides
  /:cityId` (admin.access, 404 ciudad, `updatedById`, audit
  `CITY_GUIDE_UPDATE`); `GET /cities/:slug` incluye `guide` +
  `hasGuide` respetando flag `city_guides`. Specs vitest.
- [x] 3. Front admin `/admin/ciudades` (lista con estado
  vacía/parcial/completa → ficha editor por sección con contador,
  guardado + dirty-guard al salir, console-patterns, i18n es-CL,
  impeccable) + entrada nav admin.
- [x] 4. Front público `/ciudades/[slug]`: secciones con contenido
  bajo el hero (tabs/accordion según craft — solo las con texto).
- [x] 5. architecture.md + qa-inventory + openapi regen; validate +
  archive (orquestador).
