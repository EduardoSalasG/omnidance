# Tasks — feature-flags-admin

- [x] 1. Schema `FeatureFlag` + migración (orquestador) + seed del
  catálogo en `seed-common` (`social_pass` OFF; `trip_planner`,
  `city_guides`, `city_landing` ON — upsert que no pise `enabled`
  de un flag ya tocado por admin).
- [x] 2. `FeatureFlagsService` + endpoints: `GET /admin/feature-flags`,
  `PATCH /admin/feature-flags/:key` (404 si no existe, audita
  `FEATURE_FLAG_TOGGLE`, invalida cache), `GET /features` público
  (mapa, cache-control corto). `isEnabled` para gates server-side.
- [x] 3. Front: `/admin/funcionalidades` (console-patterns, skeleton
  de carga, toggle sin confirm + revert en error, i18n es-CL) +
  entrada en nav admin + `useFeatures`/context en layout (app) que
  fetchea `GET /features` una vez.
- [~] 4. Specs vitest service/controller + playwright/web según
  superficie; architecture.md + qa-inventory; validate + archive.
