# Tasks: onboarding-tours-pass

## 1. Viewport del popover (TDD)

- [x] 1.1 Extraer `isAnchorVisible(el)` de `resolveSteps` en
  `OnboardingRunner.tsx` exigiendo intersección con el viewport. Test
  primero (`OnboardingRunner.test.tsx` o spec junto al helper): rect
  fuera por `translateY(-100%)` → excluido; `display:none` (0 rects) →
  excluido; parcialmente visible → incluido; totalmente fuera abajo →
  excluido. Verificar RED → GREEN con vitest.
- [x] 1.2 `.driver-popover.omnidance-tour` en `globals.css`:
  `max-width: min(300px, calc(100vw - 24px))`,
  `max-height: calc(100dvh - 24px)`, `overflow-y: auto`.
- [x] 1.3 `TourStep` suma `align?: "start" | "center" | "end"` pasado al
  popover de driver; `align: "end"` en steps anclados al borde derecho
  (`appbar-bell`, `nav-profile`, `staff-counter`).

## 2. Copy es-CL + espejos

- [x] 2.1 Reescribir `apps/web/src/i18n/parts/tours.json` aplicando el
  glosario D1 de design.md (roster→lista, card→objeto, chip→estilo,
  tabs→botones, nav→menú, checklist→Primeros pasos, matrícula→inscripción,
  POS→caja, digests→resúmenes, RBAC→Permisos y roles, insights→Tu
  actividad, offline→sin señal, evidencia→comprobante, paginado→por
  páginas, atribución/retrospectiva/corridas) y eliminando los 17
  ` - ` separadores.
- [x] 2.2 Remover keys muertas `crm.s5` y `academia-alumnos.s6`; quitar
  los steps en `crm/page.tsx` y `academia/alumnos/page.tsx`.
- [x] 2.3 Reescribir el bloque `admin.*` para el home admin (4 pasos:
  KPIs, leads, módulos por menú, campana) y agregar `productorEventos.*` (3) y `academia-series.*` (3).
- [x] 2.4 Espejar todos los cambios en `en/`, `fr/`, `pt-PT/` tours.json.
  Verificar `node apps/web/scripts/i18n-audit.cjs` → ALL_KEYS_OK y
  `i18n-parity.cjs` verde.

## 3. Mounts

- [x] 3.1 `HomeHub.tsx`: mount `OnboardingRunner tour="admin"` en el
  branch `activeRole === "ADMIN"` + anchor `data-tour="admin-kpis"`
  sobre la sección de KPIs agrupados. Steps: admin-kpis, admin-leads,
  appbar-menu (bottom) + app-sidebar (right), appbar-bell (bottom,
  align end).
- [x] 3.2 `/productor/eventos/page.tsx`: anchors
  `producer-events-filters`, `producer-events-list`,
  `producer-events-new` (wrapper del CTA) + mount
  `tour="productor-eventos"` en `gate === "ready"`.
- [x] 3.3 `/academia/series/page.tsx`: anchors
  `academy-series-filters`, `academy-series-list`, `academy-series-new`
  + mount `tour="academia-series"` tras gate ready.

## 4. e2e + docs

- [x] 4.1 `e2e/helpers.ts`: `TOUR_KEYS` += `admin`,
  `productor-eventos`, `academia-series`.
- [x] 4.2 `docs/qa-flows-inventory.md`: actualizar el anexo de tours
  (claves nuevas, steps muertos removidos, admin montado, criterio de
  vocabulario tour ↔ label visible).

## 5. Verificación

- [x] 5.1 `pnpm --filter @omnidance/web typecheck` + eslint de archivos
  tocados: limpio.
- [x] 5.2 vitest de web (spec del helper + suites tocadas): verde.
- [x] 5.3 `openspec validate --changes` verde.
- [x] 5.4 Smoke visual manual: un tour en mobile 320px con appbar
  oculta por scroll (popover contenido, paso omitido) y el tour admin
  en desktop corriendo sobre `/inicio` lente ADMIN.
