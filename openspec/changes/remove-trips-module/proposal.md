# remove-trips-module — Eliminación del módulo Viajes

## Why

`/viajes` (anuncio "voy a X ciudad/congreso" + matching con otros viajeros) no tira su peso como módulo: es una vertical completa (página, nav, componente, endpoints, modelo Prisma, validación de dominio) para una función marginal que no se alinea con el foco actual del producto (conversión a eventos + prácticas locales). Decisión de producto: eliminarlo completo, no solo ocultarlo del nav.

## What Changes

- **Web**: se elimina `/viajes` (página), `TripMatches`, la entrada "Viajes" del sheet social del bailarín, el label de ruta, el icono `trips`, el namespace i18n `trips` y el disallow en `robots.ts`. La key `until` ("Hasta") que `AvailabilitySection` reusaba pasa a `availability.until`.
- **API**: se eliminan `TripsController` (`POST /trips`, `GET /trips/mine`, `GET /trips/matches`), su registro en `SocialModule`, y `TripInput`/`assertTripInput` del dominio social.
- **Datos**: se elimina el modelo `Trip` de `schema.prisma` — drop de tabla vía `db push` (repo sin migraciones versionadas). **BREAKING**: se pierden los trips existentes (dato demo, sin usuarios reales).
- **Tests**: fuera los describes de trips en `social.e2e.spec.ts` y `gap-passes.e2e.spec.ts` (archivo renombrado desde `gap-passes-trips`), y el describe de `assertTripInput` en `social.service.spec.ts`.
- **Docs**: `openapi.json` + Postman regenerados (161 paths); `architecture.md`, READMEs y `omni-dance.md` sin referencias a trips.

## Capabilities

### Modified Capabilities
- `social-modules-scope`: `/viajes` deja de existir — el sheet del bailarín queda con Bailes + Prácticas.

## Impact

- **Endpoints eliminados**: `POST /api/trips`, `GET /api/trips/mine`, `GET /api/trips/matches` — cualquier cliente que los llame recibe 404.
- **Sin migración de datos**: la tabla `Trip` se dropea directa (solo contenía data de seed/demo).
- **Preservado**: `/bailes`, `/practicas`, disponibilidad, partner-requests y el resto del módulo social quedan intactos.
