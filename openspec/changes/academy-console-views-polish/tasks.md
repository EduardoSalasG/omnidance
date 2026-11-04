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

- [ ] 2. `academia/alumnos` (3 páginas + students-section,
  enrollment-form, enrollment-levels-editor, students-insights)
- [ ] 3. `academia/planes` + `academia/promos` (+ plans-section,
  plan-form, academy-promo-form)
- [ ] 4. `academia/cobros` (5 páginas + claims-queue, cobros-*,
  order-claims-queue)
- [ ] 5. `academia/equipo` (6 páginas + staff-section,
  instructor-section, staff-form, survey-results)
- [ ] 6. `academia/videos` + `academia/preventas` (+ videos.tsx,
  video-form, producer/academy-sales-section)
- [ ] 7. `academia/configuracion/*` (clases, metodos-de-pago,
  perfil, apariencia, importar) + componentes de sección
- [ ] 8. `academia/configuracion/suscripcion` (academy-billing +
  academy-billing-return)
- [ ] 9. `/analitica` (página + surface propia; components/query
  read-only)

## Docs / cierre (orquestador)

- [ ] 10. Integrar keys i18n reportadas, qa-flows-inventory (rutas
  nuevas + flujos tocados), tsc + i18n audit + lint global, review
  por sección, archivar el change.
