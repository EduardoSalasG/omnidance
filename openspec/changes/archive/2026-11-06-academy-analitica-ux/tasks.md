# Tasks: academy-analitica-ux

## Catálogo shared (`packages/shared/src/query-catalog.ts`)

- [x] `FilterDef`: nuevo flag opcional `requiresScope` (la fuente FK
      exige scope explícito; la UI no la resuelve con scope vacío).
- [x] `FkSource`: nuevas fuentes `academyScheduleSlots` y
      `academyClasses`.
- [x] `listId` (entidad `guestlist`): marcar `requiresScope: true`.
- [x] Entidad `attendance`: filtros nuevos `slotId`
      (`academyScheduleSlots`) y `classId` (`academyClasses`).
- [x] Quitar la entidad `bookings` del catálogo ACADEMY_OWNER.
- [x] `cd packages/shared && pnpm build` (la API consume `shared/dist`).

## API

- [x] `query.service.ts` `academyScoped`: `scopeId` vacío en lente
      ACADEMY_OWNER → resolver la unión sobre todas las academias
      propias; >1 academia → sufijo `· {academia}` en labels y dedupe
      por `value`; `scopeId` ajeno → `[]` (sin cambio); ADMIN sin
      scopeId → 400.
- [x] `query.service.ts` `options()`: casos `academyScheduleSlots`
      (ClassSlot de la academia: `{serie} · {día semana|fecha} {hora}`,
      orden serie/día/hora) y `academyClasses` (Class de la academia:
      `{serie} · {fecha} {hora}`, `date desc`, take 300).
- [x] `entities/academy.ts`: `attendance` aplica `slotId`
      (`classSlotId`) y `classId` (`Attendance.classId`).
- [x] `entities/academy.ts`: `ORDER_TYPES` suma `PLATFORM_CHARGE`
      (paridad con el catálogo - hoy el filtro declarado cae en 400).
- [x] `entities/academy.ts` + `ENTITY_TITLES`: retirar `bookings`
      (handler, constante y título PDF).
- [x] `query.service.spec.ts`: test de unión sin scopeId (multi-academia
      con sufijo, dedupe) y `scopeId` ajeno → `[]`.

## Web

- [x] `FilterBar.tsx`: el effect de fuentes lazy intenta resolver con
      `scopeValue` aunque venga vacío, excepto filtros `requiresScope`
      (esos solo cargan con scope elegido).
- [x] `QueryTable.tsx`: prop `personBasePath` para el link de la celda
      persona (default actual).
- [x] `QueryTable.tsx` `cellText`: `YYYY-MM-DD` e ISO `T00:00:00Z` →
      fecha del locale en UTC; otro ISO → fecha+hora local; strings con
      clave en `query.optionLabels` → label.
- [x] `analitica/page.tsx`: `personBasePath` =
      `/academia/alumnos` en lente ACADEMY_OWNER,
      `/analitica/usuarios` en los demás.
- [x] i18n `parts/query.json` (es-CL + en + fr + pt-PT):
      `filters.slotId` ("Horario"), `filters.classId` ("Clase"),
      `optionLabels.PLATFORM_CHARGE`, `optionLabels.PRIVATE`.

## Verificación

- [x] `cd apps/api && npx tsc --noEmit` y
      `cd apps/web && npx tsc --noEmit` limpios.
- [x] Vitest de `query.service.spec.ts` verde (16 tests).
- [x] Curl contra la API viva: `/query/options` sin `scopeId` devuelve
      planes/series/instructores/slots/classes de Mambo Madness;
      `attendance` con `slotId` → 122 asistencias (de 4073), con
      `classId` → 14; `bookings` → 400; `orderType=PLATFORM_CHARGE` →
      200 con 0 filas.
- [x] Actualizar `docs/qa-flows-inventory.md` §7 (entidades, fuentes
      sin scope, link de persona por lente).
