# academy-level-line-consistency

## Why

La regla "una línea de niveles por academia" (custom si existe, global
si no) existe en `GET /academies/:id/class-levels` y en el insight de
niveles, pero el resto de superficies la ignora:

- `GET /classes/catalogs` devuelve **todos** los `ClassLevel` (global +
  customs de todas las academias): el select de nivel al crear/editar
  una clase, el filtro de nivel del listado y el editor de niveles del
  alumno muestran duplicados por nombre (Mambo Madness: "Básico"
  global + "Básico" custom).
- El card "Niveles y cupos" del inicio lista horarios de series
  eliminadas lógicamente (filtra `slot.deletedAt` pero no
  `series.deletedAt`).
- El seed de Mambo Madness dejó series duplicadas (la misma clase en
  nivel global y en custom) y series "borradas" con `active:true` que
  siguen materializando clases y apareciendo en superficies (el
  soft-delete del seed no imita al del API, que además pone
  `active:false` y cancela clases futuras).

## What Changes

- **API**: `GET /classes/catalogs?academyId=` devuelve la línea
  efectiva de la academia (custom si existe, global si no). Sin
  `academyId` devuelve solo la línea global: el catálogo público deja
  de mezclar customs de todas las academias.
- **API**: `POST/PATCH /academies/:id/series` valida que `levelId`
  pertenezca a la línea efectiva de la academia; 400 en caso
  contrario.
- **API**: las superficies de clases/horarios excluyen series con
  `deletedAt` (`/classes/browse`, `/classes/mine`, `/classes/teaching`,
  próximas de `GET /academies/:id`, `GET /academies/:id/slots`,
  `insights/levels` y el conteo de slots del dashboard).
- **Web**: `series-form`, filtros de `/academia/series` y
  `EnrollmentLevelsEditor` piden `catalogs?academyId=` (el editor gana
  prop `academyId`).
- **Seed** (`seed-dev.ts`): `levelId` resuelve la línea efectiva de la
  academia (custom > global); bloque Mambo Madness deduplica series
  por nombre+horario conservando la de más data (asistencias +
  reservas + clases), la rebinding a la línea custom; los perdedores y
  las series fuera de parrilla reciben soft-delete espejo del API
  (`active:false` + `deletedAt` + clases futuras canceladas + reservas
  liberadas); slots duplicados dentro de la serie se podan quedando el
  de más data.
- **Enrich** (`enrich-academy-seed.cjs`): el mapa `levelId` por nombre
  se resuelve por línea efectiva de cada academia (hoy pisa globales
  con customs según orden de `findMany`).

## Capabilities

### New Capabilities

(ninguna)

### Modified Capabilities

- `academies/class-levels`: la línea efectiva se extiende a
  catálogos/selects (`/classes/catalogs?academyId=`), no solo al
  mantenedor y el insight.
- `academies/class-series`: `levelId` queda restringido a la línea
  efectiva al crear/editar; una serie eliminada lógicamente tampoco
  aparece en superficies de clases (explorar, próximas, insights).
- `academies/enrollment-levels`: las opciones del editor son la línea
  efectiva de la academia.
- `academies/owner-insights`: "Niveles y cupos" solo considera
  horarios de series vigentes (`series.deletedAt: null`).

## Impact

- API: `classes.controller.ts` (catalogs, browse, mine, teaching),
  `academies.controller.ts` (upcoming, slots, insights/levels,
  dashboard slot count), `class-series.controller.ts` (validación de
  `levelId` en create/update).
- Web: `series-form.tsx`, `academia/series/page.tsx`,
  `enrollment-levels-editor.tsx` + `academia/alumnos/[personId]/page.tsx`.
- Datos demo: `apps/api/prisma/seed-dev.ts` (bloque Mambo Madness),
  `apps/api/scripts/enrich-academy-seed.cjs`.
- Docs: `docs/openapi.json` + postman regenerados (param nuevo),
  `docs/architecture.md`, `docs/qa-flows-inventory.md`.
