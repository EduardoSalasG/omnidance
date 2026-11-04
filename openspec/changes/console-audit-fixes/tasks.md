# Tasks: console-audit-fixes

Orden de implementación sugerido: fundación (1-2) → bloqueantes (3-4)
→ expands (5) → transversales (6-8) → secciones (9-13) → docs (14).

## 1. Componente compartido `SeeAllRow`

- [ ] Crear `components/ui/see-all-row.tsx` (`LIST_PREVIEW` +
  `SeeAllRow`) según design.md §componente.
- [ ] Verificar/adecuar keys `common.seeAll`/`common.showLess`
  (interpolación `{count}`) en los 4 locales.
- [ ] Migrar `series/[id]/page.tsx` al componente compartido.

## 2. Chrome: ConsoleHeader universal

- [ ] `academia/planes/page.tsx`, `academia/promos/page.tsx`,
  `academia/configuracion/niveles/page.tsx`: agregar `ConsoleHeader`
  back → `/academia`.
- [ ] `analitica/usuarios/page.tsx`: `ConsoleHeader` back →
  `/analitica` (bloqueante 2).
- [ ] Subpáginas de `/academia/configuracion/*` que lo omiten
  (clases, perfil, apariencia, importar, suscripcion,
  metodos-de-pago): `ConsoleHeader` back → `/academia`.

## 3. Colas de cobros: errores visibles (bloqueante 1)

- [ ] `claims-queue.tsx`, `order-claims-queue.tsx`,
  `cobros-history.tsx`: propagar estado de error → `role="alert"` +
  retry (nunca vacío silencioso). Mantener excepción documentada solo
  en KPIs auxiliares (`cobros-kpis`, `cobros-expiring`).
- [ ] `academy-dashboard.tsx` ExpiringList: chevron en filas
  navegables.

## 4. Forbidden ≠ error

- [ ] `cobros/claim/[id]`, `cobros/orden/[id]`, `cobros/pago/[id]`:
  401/403/404 → estado "sin acceso"; resto → alert + retry.
- [ ] `staff-section.tsx`, `instructor-section.tsx`: 403 por cap →
  estado sin-acceso (o sección omitida), nunca "Sin colaboradores".

## 5. Expands (LIST_PREVIEW + SeeAllRow)

- [ ] `alumnos/[personId]`: Pagos (l378-406), Historial (466-488),
  Próximas (506-529).
- [ ] `planes/[id]`: alumnos vigentes (192-212).
- [ ] `preventas/[id]`: códigos emitidos (311-341).
- [ ] `profesor/[id]` `CourseSurveyResults`: preview 3 grupos +
  comentarios por grupo acotados.
- [ ] `analitica/usuarios/[personId]`: producers, academies,
  roleHistory, byAcademy/byStyle/byGenre, activeEnrollments.
- [ ] `cobros` claims-queue: PENDING preview 20 + expand; resueltos
  LIST_PREVIEW.
- [ ] `preventas/page`: separar pendientes vs resueltos + expand en
  resueltos.
- [ ] `importar` `import-section.tsx`: preview 10 filas CSV + expand.

## 6. Feedback de acción: Spinner inline

- [ ] `staff-form.tsx:271`, `video-form.tsx:137`,
  `preventas/[id]:304,355`, botón Guardar de `alumnos/[personId]`:
  reemplazar `tc("loading")` por `Spinner` inline.

## 7. Cross-refs navegables

- [ ] `cobros/claim/[id]:197` y `cobros/orden/[id]:211`: nombre →
  Link `/academia/alumnos/[personId]`.
- [ ] `cobros/orden/[id]:233-238`: `fieldOrderRef` → Link `pago/[id]`.
- [ ] `alumnos/[personId]`: filas historial/próximas → Link
  `/academia/clases/[classId]` con chevron; migrar filas sueltas a
  `Card padded={false}` + `divide-y`.
- [ ] `analitica/usuarios/[personId]`: actores con id → Link a su
  ficha; `dl`/`dt`/`dd` semántico en Row/SectionCard.
- [ ] `QueryTable`: celda persona → Link cuando hay `personId`.

## 8. Transversales de patrón

- [ ] `hover:border-neon/40` → `/60`: staff-section:188,
  instructor-section:110, payment-methods-admin:127.
- [ ] `<section>` sin nombre → `div` o `aria-label`:
  `equipo/[id]:124`, `profesor/[id]:156`, `planes/[id]:128`.
- [ ] `planes/[id]`: datos del plan → `dl`; delta KPI neon/warn →
  green-400/red-400; fallback Suspense y notFound con CTA en
  `planes/nueva`.
- [ ] `metodos-de-pago/[methodId]`: zona destructiva canónica
  (`border-t pt-6`, ghost `text-red-400 hover:text-red-300`);
  notFound con CTA.
- [ ] `preventas/page:83`: empty sin `role="status"`.
- [ ] `video-form.tsx:72`: forbidden sin `role="alert"`.
- [ ] Empty con filtros → `query.empty`: `cobros/reporte:311`,
  `videos` listado.
- [ ] `ThemeToggle` segmented `min-h-9` → `min-h-11`.
- [ ] `students-section`: CTA "+ Nuevo" a `justify-end`.
- [ ] `academy-profile`: input file `hidden` → `sr-only`.
- [ ] `instructor-section`: `FilterBar` + `EntityDef` (paridad con
  staff); cards → `<Card>`.
- [ ] `AcademyPromoForm`: estado explícito de error al cargar planes
  (chips vacíos ≠ "todos").

## 9. Mantenedor de niveles al patrón

- [ ] `/configuracion/niveles`: listado solo navegable.
- [ ] `/configuracion/niveles/nuevo`: alta dedicada.
- [ ] `/configuracion/niveles/[id]`: edición + zona roja delete con
  `ConfirmSheet`; 409 "en uso" → ActionNotice.

## 10. Promos refactor + navegación

- [ ] `PromosModule`/`PromoDetailModule` con prop `academyId`
  (patrón planes/series); eliminar `queueMicrotask`.
- [ ] `/promos/nueva`: tras ActionNotice → listado (no ficha).
- [ ] Ficha promo: `pt-4`→`pt-6` en zona de acciones; retry con
  RefreshIcon.

## 11. Videos

- [ ] Delete inline → `ConfirmSheet` (excepción documentada en
  `console-patterns` SKILL.md).

## 12. API: cap encuestas instructor

- [ ] `GET /academies/:id/instructors/:personId/surveys`: `limit` de
  grupos (default 12, max 60) + cap 50 comentarios/grupo.
- [ ] `survey-results.tsx`: `key` estable en comentarios (no `i`).

## 13. Verificación

- [ ] `npx tsc --noEmit` web limpio.
- [ ] `node scripts/i18n-audit.cjs` → `ALL_KEYS_OK`.
- [ ] `pnpm --filter @omnidance/api build` (cap encuestas).
- [ ] Smoke visual mobile+desktop en: cobros, alumnos/[id],
  planes/[id], preventas, niveles, promos, analitica/usuarios.

## 14. Docs e inventario

- [ ] `docs/qa-flows-inventory.md`: nuevas rutas de niveles, cambio
  post-crear promo, expands.
- [ ] `console-patterns` SKILL.md: excepción documentada de videos;
  patrón `SeeAllRow` en referencias canónicas.
- [ ] `openspec validate --changes` verde y archivar al integrar.
