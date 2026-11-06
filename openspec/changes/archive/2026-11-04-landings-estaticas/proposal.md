## Why

Las landings públicas pegan al API en cada render (fetch server-side con ISR `revalidate`), consumiendo horas activas del backend y acoplando la disponibilidad del sitio de marketing a la DB. Pedido del usuario 2026-11-04: landings 100% estáticas. La data dinámica pasa a vivir en catálogos JSON commiteados y editables (regenerables desde el API bajo demanda), no quemada en el código.

Alcance acordado con el usuario: "landing" = `/`, `/pro`, `/para-academias` y `/para-productores`. `/terminos` y `/privacidad` ya son estáticas (verificado, no llaman al API). `/ciudades`, `/pase`, `/e/[id]`, `/reclamar/[token]` y el resto de `(marketing)` quedan como están (superficies funcionales/dinámicas, fuera del alcance).

## What Changes

- Nuevo directorio de contenido `apps/web/src/content/` con catálogos JSON editables: `events.json` (eventos destacados para strip + JsonLd) y `academies.json` (directorio para el strip de academias).
- Nuevo script `apps/web/scripts/sync-marketing-content.mjs` (`pnpm --filter @omnidance/web content:sync`) que regenera los catálogos desde los endpoints públicos del API; el resultado se commitea y también se puede editar a mano.
- `/`, `/pro`, `/para-academias`, `/para-productores`: eventos y academias salen del catálogo en vez de `GET /api/events` y `GET /api/academies/public` en render. `revalidate` ISR se conserva para recalcular "esta semana" sin tocar el API.
- `lib/public-events.ts` y `lib/public-academies.ts` se eliminan; `lib/public-cities.ts` se mantiene (lo usan `/ciudades` y `sitemap.ts`, fuera del alcance).
- Los endpoints públicos del API no cambian: los consume el script de sync y las superficies de app/admin.

## Capabilities

### New Capabilities

- `marketing-content`: catálogos de contenido estáticos commiteados que alimentan las landings; regla de cero requests al API en el render de las landings; script de sincronización desde el API.

### Modified Capabilities

- `landing-marketing`: la prueba social pasa de endpoints vivos (`GET /events`, `GET /academies/public`) a los catálogos de contenido commiteados (eventos destacados y academias editables).

## Impact

- `apps/web/src/content/` (nuevo): `events.json`, `academies.json`.
- `apps/web/src/lib/marketing-content.ts` (nuevo loader tipado); elimina `lib/public-events.ts` y `lib/public-academies.ts`.
- Páginas `(marketing)`: `page.tsx` (home), `pro/page.tsx`, `para-academias/page.tsx`, `para-productores/page.tsx`.
- `apps/web/src/components/landing/Landing.tsx`: import del tipo `PublicAcademy` desde el loader nuevo.
- `apps/web/scripts/sync-marketing-content.mjs` (nuevo) + script `content:sync` en `apps/web/package.json` + comando documentado en `AGENTS.md`.
- API: sin cambios.
- `docs/qa-flows-inventory.md`: sección de landings actualizada (fuente de datos = catálogo).
