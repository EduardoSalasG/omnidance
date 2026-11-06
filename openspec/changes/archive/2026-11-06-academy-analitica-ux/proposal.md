# Proposal: academy-analitica-ux

## Why

La revisión UX de la consola Academy Owner
(`docs/academy-console-ux-review-2026-11-05.md`) y la prueba manual de
`/analitica` con un owner PRO (gabriel, Mambo Madness) levantaron
defectos concretos de la consola de consultas en lente ACADEMY_OWNER:

- Los selects FK dependientes del scope (`planId`, `seriesId`,
  `instructorId`) quedan vacíos (solo "Todos"): la UI solo resuelve
  `/query/options` cuando el filtro de academia tiene valor y la API
  exige `scopeId`, aunque la semántica del motor es "sin academia =
  todas las propias". Un owner de una sola academia debe elegirla a
  mano solo para poblar los selects.
- El link de persona en la tabla de resultados apunta siempre a
  `/analitica/usuarios/[personId]`, ficha solo-admin: en lente
  academia el alumno debe ir a `/academia/alumnos/[personId]`.
- Las celdas fecha salen en ISO crudo (`2026-11-30T15:00:00.000Z`) y
  las celdas enum salen crudas (`ACTIVE`, `MEMBERSHIP`).
- El enum `orderType` ofrece `PLATFORM_CHARGE` sin label i18n (se ve
  crudo) y el handler del lente academia lo rechaza con 400 pese a
  estar declarado en el catálogo.
- Falta filtrar asistencia por horario (slot semanal) y por clase
  concreta (ocurrencia), pedido explícito del owner.
- La entidad `bookings` no le aporta al owner: su gestión de reservas
  vive en las fichas de clase.

## What Changes

- **Fuentes FK sin scope** (`/query/options` + FilterBar): las fuentes
  academy (`academyPlans`, `academyClassSeries`, `academyInstructors`
  y las nuevas) resuelven la unión sobre todas las academias propias
  cuando `scopeId` viene vacío; con más de una academia el label lleva
  sufijo `· {academia}` y se deduplica por `value`. El catálogo gana
  `FilterDef.requiresScope` (solo `eventGuestLists`): la UI no pide
  opciones sin scope para esas fuentes (producer conserva el 400).
- **Drill de persona por lente** (`QueryTable`): prop `personBasePath`;
  `/analitica` pasa `/academia/alumnos` en lente ACADEMY_OWNER y
  conserva `/analitica/usuarios` en PRODUCER/ADMIN.
- **Celdas normalizadas** (`QueryTable`): strings `YYYY-MM-DD` e ISO a
  medianoche UTC se formatean como fecha es-CL en UTC; el resto de ISO
  como fecha+hora local; strings con match en `query.optionLabels` se
  traducen (estados, métodos, tipos de orden). CSV/PDF no cambian.
- **`orderType`**: labels i18n para `PLATFORM_CHARGE` y `PRIVATE`
  (valor persistido real) en los 4 locales; la whitelist del handler
  academy suma `PLATFORM_CHARGE` para paridad con el catálogo.
- **Filtros nuevos en `attendance`**: `slotId` (fuente
  `academyScheduleSlots`: `{serie} · {día} {hora}`) y `classId`
  (fuente `academyClasses`: `{serie} · {fecha} {hora}`, las 300 más
  recientes), con resolver en `/query/options` y whitelist en run.
- **`bookings` fuera del lente ACADEMY_OWNER**: se quita del catálogo,
  del registry de handlers y de los títulos del PDF (revertible con
  git). PRODUCER/ADMIN no la tenían.

## Impact

- Spec afectada: `analytics/query-console` (única).
- Código: `packages/shared/src/query-catalog.ts`,
  `apps/api/src/query/query.service.ts`,
  `apps/api/src/query/entities/academy.ts`,
  `apps/web/src/components/query/FilterBar.tsx`,
  `apps/web/src/components/query/QueryTable.tsx`,
  `apps/web/src/app/[locale]/(app)/analitica/page.tsx`,
  `apps/web/src/i18n/parts{,/en,/fr,/pt-PT}/query.json`.
- Contratos: `GET /query/options` deja de exigir `scopeId` en fuentes
  academy (cambio aditivo; con `scopeId` ajeno sigue devolviendo `[]`).
  Sin endpoints nuevos ni cambios de firma: no se regenera
  openapi/postman.
- Datos/migraciones: ninguna.
