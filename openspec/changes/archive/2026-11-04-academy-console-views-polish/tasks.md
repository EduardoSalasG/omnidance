# Tasks: academy-console-views-polish

## Renombres (orquestador)

- [x] 1. `general`→`clases`, `pagos`→`metodos-de-pago`,
  `/academia/suscripcion`→`configuracion/suscripcion`: páginas
  movidas, redirects en rutas viejas (incl. `[methodId]` dinámico),
  links internos y BottomNav actualizados, keys i18n
  `configPages.classes|payMethods|subscription` en 4 locales,
  `ConsoleHeader` removido de suscripción (nivel 1). tsc + i18n
  audit verdes.

## Polish por sección (agentes paralelos herdr)

- [x] 2. `academia/alumnos` (3 páginas + students-section,
  enrollment-form, enrollment-levels-editor, students-insights)
- [x] 3. `academia/planes` + `academia/promos` (+ plans-section,
  plan-form, academy-promo-form)
- [x] 4. `academia/cobros` (5 páginas + claims-queue, cobros-*,
  order-claims-queue)
- [x] 5. `academia/equipo` (6 páginas + staff-section,
  instructor-section, staff-form, survey-results)
- [x] 6. `academia/videos` + `academia/preventas` (+ videos.tsx,
  video-form, producer/academy-sales-section)
- [x] 7. `academia/configuracion/*` (clases, metodos-de-pago,
  perfil, apariencia, importar) + componentes de sección
- [x] 8. `academia/configuracion/suscripcion` (academy-billing +
  academy-billing-return)
- [x] 9. `/analitica` (página + surface propia; components/query
  read-only)

## Docs / cierre (orquestador)

- [x] 10. Integrar keys i18n reportadas, qa-flows-inventory (rutas
  nuevas + flujos tocados), tsc + i18n audit + lint global, review
  por sección, archivar el change.
