# Tasks: landings-estaticas

## 1. Catálogos de contenido y loader

- [x] 1.1 Crear `apps/web/src/content/` con `events.json` y `academies.json` (contenido inicial generado por el sync, task 2). Verificar que `tsc` resuelve los imports JSON (`resolveJsonModule` ya activo).
- [x] 1.2 Crear `apps/web/src/lib/marketing-content.ts` con `marketingEvents()`, `marketingAcademies()`, `thisWeek()` y el tipo `PublicAcademy` (mudado desde `public-academies.ts`). Verificar con `pnpm --filter @omnidance/web typecheck`.

## 2. Script de sincronización

- [x] 2.1 Crear `apps/web/scripts/sync-marketing-content.mjs`: resuelve API (`API_URL` > `API_PROXY_TARGET` > `http://127.0.0.1:4000`), fetch a `/api/events` y `/api/academies/public`; recolecta todo antes de escribir; aborta con exit≠0 sin tocar archivos si algo falla. Verificar: con API viva escribe los JSONs con `generatedAt`; con API caída sale con error y no modifica nada.
- [x] 2.2 Agregar script `content:sync` a `apps/web/package.json` y documentarlo en `AGENTS.md` (sección comandos). Verificar `pnpm --filter @omnidance/web content:sync` corre.

## 3. Landings desde catálogo

- [x] 3.1 `(marketing)/page.tsx`, `pro/page.tsx`, `para-academias/page.tsx`, `para-productores/page.tsx`: reemplazar `fetchPublicEvents`/`fetchPublicAcademies` por el loader de catálogo; `export const revalidate = 3600` para que `thisWeek()` se recalcule por ISR. Verificar: con API apagada, las 4 rutas devuelven 200 con strip y JsonLd poblados del catálogo.
- [x] 3.2 Eliminar `lib/public-events.ts` y `lib/public-academies.ts` (conservar `lib/public-cities.ts`: lo usan `/ciudades` y `sitemap.ts`, fuera del alcance). Actualizar el import de `PublicAcademy` en `components/landing/Landing.tsx`. Verificar: `pnpm --filter @omnidance/web typecheck` y `lint` limpios; no quedan imports de `public-events`/`public-academies`.

## 4. Docs y verificación

- [x] 4.1 Actualizar `docs/qa-flows-inventory.md` (sección de landings: fuente de datos = catálogo commiteado). Verificar diff refleja la nueva fuente.
- [x] 4.2 Catálogos commiteados al día (`content:sync` contra el seed vigente). Verificar `git status` muestra solo los JSONs esperados.
- [x] 4.3 Verificación integral: `pnpm --filter @omnidance/web typecheck`, `lint`, `build` verdes; smoke manual con API **apagada**: `/`, `/pro`, `/para-academias`, `/para-productores` responden 200 con contenido del catálogo y cero requests al API en logs.
- [x] 4.4 `openspec validate --changes` verde; archivar el change al mergear (sin `--skip-specs`).
