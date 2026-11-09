# Proposal: onboarding-tours-pass

## Why

Auditoría de los 26 tours de primera visita (driver.js + `tours.json`)
encontró tres problemas:

1. **Copy**: anglicismos y tecnicismos que la propia UI no usa
   ("roster", "card", "chip", "nav", "tabs", "RBAC", "POS", "matrícula",
   "insights", "checklist", "digests", "offline", "paginado") más 17
   violaciones de la regla de puntuación del repo (` - ` como separador
   de ideas). El usuario pidió copy preciso, cercano y sin tecnicismos.
2. **Viewport**: el popover puede escapar de la pantalla: el CSS no
   topa el ancho en `vw` (driver fija `max-width: 300px`), y el filtro
   de anchors (`getClientRects() > 0`) acepta elementos fuera del
   viewport (appbar oculta por `translateY(-100%)` al scrollear).
3. **Cobertura**: el tour `admin` existe en el catálogo pero nunca se
   montó; dos steps son muertos (`crm.s5` sin switcher de actor en la
   UI, `academia-alumnos.s6` porque la importación vive en
   `/academia/configuracion/importar`); y consolas clave sin tour
   (`/productor/eventos` y `/academia/series`).

## What Changes

- **Reescritura del copy es-CL** de `apps/web/src/i18n/parts/tours.json`:
  vocabulario calzado a los labels reales de cada superficie (ej.
  "roster" → la lista de reservados, "matrícula" → "inscripción",
  "checklist" → "Primeros pasos"), sin anglicismos internos ni ` - `.
  Espejos `en`, `fr` y `pt-PT` actualizados en el mismo cambio.
- **Limpieza**: se eliminan los steps muertos `crm.s5` y
  `academia-alumnos.s6` (mount + copy en los 4 locales).
- **Contención de viewport**: `.omnidance-tour` recibe
  `max-width`/`max-height` relativas al viewport; el runner resuelve
  anchors por intersección con el viewport (no solo por rects > 0) y
  soporta `align` para anchors pegados al borde derecho.
- **Tour `admin` montado** en el home de la lente ADMIN (HomeHub), con
  copy adaptado a los anchors disponibles (KPIs, cola de leads,
  menú/sidebar, campana).
- **Tours nuevos**: `productor-eventos` en `/productor/eventos` y
  `academia-series` en `/academia/series`, cada uno con sus anchors
  `data-tour`.
- **e2e**: `TOUR_KEYS` de `e2e/helpers.ts` suma las 4 claves nuevas.
- **Docs**: inventario QA actualizado (keys, anchors, criterio de
  vocabulario tour ↔ label visible).

## Capabilities

### New Capabilities


### Modified Capabilities

- `admin/home-insights`: agrega el tour de primera visita del inicio
  admin (`onboarding["admin"]`), montado sobre los anchors reales del
  home (KPIs agrupados, cola de leads, chrome).
- `responsive-app-shell`: el requirement de tours pasa a exigir que el
  popover se mantenga dentro del viewport (tope de ancho/alto relativo
  al viewport y resolución de anchors por intersección visible, no por
  rect no nulo).
- `events/producer-console`: agrega el tour de primera visita de
  `/productor/eventos` (`onboarding["productor-eventos"]`).
- `academies/class-series`: agrega el tour de primera visita de
  `/academia/series` (`onboarding["academia-series"]`).

## Impact

- `apps/web/src/components/onboarding/OnboardingRunner.tsx`:
  intersección de viewport en `resolveSteps` + soporte `align`.
- `apps/web/src/app/globals.css`: límites de tamaño del popover.
- `apps/web/src/i18n/parts/tours.json` + `en|fr|pt-PT/tours.json`:
  copy reescrito, steps muertos removidos, bloques `admin`,
  `productorEventos` y `academia-series`.
- `apps/web/src/components/home/HomeHub.tsx`: mount `admin` + anchors.
- `apps/web/src/app/[locale]/(app)/{crm,academia/alumnos}/page.tsx`:
  steps muertos removidos.
- `apps/web/src/app/[locale]/(app)/{productor/eventos,
  academia/series}/page.tsx`: mounts + anchors nuevos.
- `e2e/helpers.ts`: `TOUR_KEYS` +3 (`admin`,
  `productor-eventos`, `academia-series`).
- `docs/qa-flows-inventory.md`: sección de tours actualizada.
- Sin cambios de API ni de datos: `onboarding` ya es un mapa libre por
  clave (`POST /me/onboarding`).
