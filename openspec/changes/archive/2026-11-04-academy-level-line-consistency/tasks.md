# Tasks: academy-level-line-consistency

## API

- [x] 1. `GET /classes/catalogs?academyId=`: levels = línea efectiva de
  la academia (custom si existe, global si no); sin parámetro solo la
  línea global. `types` sin cambios.
- [x] 2. Validación de `levelId` en `POST`/`PATCH
  `/academies/:id/series`: 400 si el nivel no pertenece a la línea
  efectiva de la academia (otra academia o global con línea custom).
- [x] 3. `series: { deletedAt: null }` en: `/classes/browse`,
  `/classes/mine`, `/classes/teaching`, próximas de `GET
  /academies/:id`, `GET /academies/:id/slots`, `classSlot.count` del
  dashboard y los 3 queries de `insights/levels` (slots, classes,
  futureClasses).
- [x] 4. Tests: catalogs con/sin academyId (custom, global, omitido);
  create/update serie con levelId inválido → 400; browse/slots no
  devuelven clases de serie eliminada; insights/levels ignora slots de
  series borradas.

## Web

- [x] 5. `series-form.tsx`: catalogs con `?academyId=`.
- [x] 6. `academia/series/page.tsx`: catalogs con `?academyId=`
  (filtro de nivel).
- [x] 7. `enrollment-levels-editor.tsx`: prop `academyId` + catalogs
  con parámetro; `alumnos/[personId]/page.tsx` pasa `academy.id`.

## Datos demo

- [x] 8. `seed-dev.ts`: `levelId` por línea efectiva de la academia en
  `mkClassSeries`; `ensure` de serie prefiere no borradas
  (deletedAt nulls-first) y resucita con `deletedAt:null`.
- [x] 9. `seed-dev.ts` (bloque Mambo): dedupe de series por nombre -
  keeper = mayor score (att+book+cls), rebind a línea custom;
  dedupe de slots dentro del keeper (mismo criterio); perdedoras y
  fuera-de-parrilla con soft-delete espejo del API (`active:false`,
  `deletedAt`, clases futuras canceladas, reservas
  CANCELLED+refunded).
- [x] 10. `enrich-academy-seed.cjs`: `levelId` por línea efectiva por
  academia.
- [x] 11. Re-correr `pnpm db:seed` y verificar: una sola serie por
  horario en Mambo Madness, niveles custom en sus series, sin
  duplicados en el select ni en "Niveles y cupos".

## Docs / cierre

- [x] 12. Regenerar `docs/openapi.json` + postman
  (`export-api-docs.cjs` con API viva).
- [x] 13. `docs/architecture.md` + `docs/qa-flows-inventory.md` según
  corresponda; archivar el change.
