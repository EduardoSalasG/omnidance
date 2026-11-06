# Tasks: academy-schedule-ux

## Web

- [x] `series-form.tsx`: fila de horario con Día/Fecha + Inicio +
  Término (+ X) siempre juntos; día a línea propia en angosto y los
  dos tiempos comparten la de abajo. `mt-1` tras los legends de
  "Tipos de clase" (real + skeleton) y "Horarios semanales".
- [x] `lib/console-page-size.ts`: `useIsDesktop` + `useConsolePageSize`
  (useSyncExternalStore sobre matchMedia lg; 20 desktop / 10 mobile).
- [x] `clases/[id]/page.tsx`: header de la clase como texto plano (sin
  Link ni chevron a la ficha del horario); booked/waitlist con slice
  local y `Pager` solo cuando exceden el pageSize (numeración de
  waitlist con offset de página).
- [x] `private-lessons.tsx`: `pageSize` del hook (reset a página 1 al
  cambiar viewport); lista conserva datos previos en refetch
  (`aria-busy` + dim, skeleton solo en carga inicial); KPIs de cola
  no se desmontan; "Cancelar" a la esquina superior derecha junto al
  precio; card reestructurada (estado + alumno / hora + instructor).
- [x] `equipo/profesor/[id]/page.tsx`: próximas clases con slice
  20/10 + `Pager`; filas apiladas en mobile; KPIs `grid-cols-1
  sm:grid-cols-3`.
- [x] `academy-levels-card.tsx`: helpers de hora a module scope +
  `slotEndTime` (endTime ausente = +1h); `MobileSlotRow` muestra
  inicio y término; `SlotCard dense` (hora + nombre truncado +
  estado) cuando el día reparte 2+ carriles.
- [x] `series/page.tsx`: `styleId` del FilterBar alimentado por
  `GET /academies/:id/series/styles` en vez del catálogo global.

## API

- [x] `class-series.controller.ts`: `GET :id/series/styles` antes de
  `:seriesId` (mismo patrón que `insights`) - dedup por styleId sobre
  series no borradas, ordenado por nombre es.
- [x] `private-lessons.controller.ts`: orden del listado a
  `scheduledAt desc` + `createdAt desc` (las sin agendar arriba).

## Seed / catálogos

- [x] `seed-common.ts`: "Cubano" y "Rueda de casino" fuera de
  `STYLE_CATALOG` y dentro de `REMOVED_STYLES` (depuración existente:
  referencias estructurales a null, personales borradas).
- [x] `seed-dev.ts`: series/roles/sesiones re-etiquetadas a "Salsa
  cubana (casino)"; líneas de `styleRole` que colisionarían con el
  rol equivalente eliminadas (josefa FOLLOWER, diego LEADER,
  rodrigo LEADER).
- [x] `enrich-academy-seed.cjs`: `danceSession.updateMany` a null antes
  de borrar estilos fixture (FK).

## Verificación y docs

- [x] `cd apps/web && npx tsc --noEmit` limpio en archivos del change
  (los únicos errores del run son de cambios en curso de otros
  changes: academy-dashboard/cobros-expiring); `cd apps/api && npx
  tsc --noEmit` limpio.
- [x] `node --check` de seeds (`--experimental-strip-types` para .ts)
  + `scripts/enrich-academy-seed.cjs`.
- [x] Vitest de archivos tocados: class-series + private-lessons
  controller specs, 59/59 verdes.
- [x] `npx openspec validate --changes` verde.
- [x] `docs/qa-flows-inventory.md` actualizado (roster, particulares,
  series, profesor, agenda).
- [x] `docs/openapi.json` + Postman regenerados (369 paths; incluye
  `GET /academies/:id/series/styles`).
