# Tasks: console-audit-fixes

Orden de implementación sugerido: fundación (1-2) → bloqueantes (3-4)
→ expands (5) → transversales (6-8) → secciones (9-13) → docs (14).

## 1. Componente compartido `SeeAllRow`

- [x] Crear `components/ui/see-all-row.tsx` (`LIST_PREVIEW` +
  `SeeAllRow`) según design.md §componente.
- [x] Verificar/adecuar keys `common.seeAll`/`common.showLess`
  (interpolación `{count}`) en los 4 locales.
- [x] Migrar `series/[id]/page.tsx` al componente compartido.

## 2. Chrome: ConsoleHeader universal

- [x] `academia/planes/page.tsx`, `academia/promos/page.tsx`,
  `academia/configuracion/niveles/page.tsx`: agregar `ConsoleHeader`
  back → `/academia`.
- [x] `analitica/usuarios/page.tsx`: `ConsoleHeader` back →
  `/analitica` (bloqueante 2).
- [x] Subpáginas de `/academia/configuracion/*` que lo omiten
  (clases, perfil, apariencia, importar, suscripcion,
  metodos-de-pago): `ConsoleHeader` back → `/academia`.

## 3. Colas de cobros: errores visibles (bloqueante 1)

- [x] `claims-queue.tsx`, `order-claims-queue.tsx`,
  `cobros-history.tsx`: propagar estado de error → `role="alert"` +
  retry (nunca vacío silencioso). Mantener excepción documentada solo
  en KPIs auxiliares (`cobros-kpis`, `cobros-expiring`).
- [x] `academy-dashboard.tsx` ExpiringList: chevron en filas
  navegables.

## 4. Forbidden ≠ error

- [x] `cobros/claim/[id]`, `cobros/orden/[id]`, `cobros/pago/[id]`:
  401/403/404 → estado "sin acceso"; resto → alert + retry.
- [x] `staff-section.tsx`, `instructor-section.tsx`: 403 por cap →
  estado sin-acceso (o sección omitida), nunca "Sin colaboradores".

## 5. Expands (LIST_PREVIEW + SeeAllRow)

- [x] `alumnos/[personId]`: Pagos (l378-406), Historial (466-488),
  Próximas (506-529).
- [x] `planes/[id]`: alumnos vigentes (192-212).
- [x] `preventas/[id]`: códigos emitidos (311-341).
- [x] `profesor/[id]` `CourseSurveyResults`: preview 3 grupos +
  comentarios por grupo acotados.
- [x] `analitica/usuarios/[personId]`: producers, academies,
  roleHistory, byAcademy/byStyle/byGenre, activeEnrollments.
- [x] `cobros` claims-queue: PENDING preview 20 + expand; resueltos
  LIST_PREVIEW.
- [x] `preventas/page`: separar pendientes vs resueltos + expand en
  resueltos.
- [x] `importar` `import-section.tsx`: preview 10 filas CSV + expand.

## 6. Feedback de acción: Spinner inline

- [x] `staff-form.tsx:271`, `video-form.tsx:137`,
  `preventas/[id]:304,355`, botón Guardar de `alumnos/[personId]`:
  reemplazar `tc("loading")` por `Spinner` inline.

## 7. Cross-refs navegables

- [x] `cobros/claim/[id]:197` y `cobros/orden/[id]:211`: nombre →
  Link `/academia/alumnos/[personId]`.
- [x] `cobros/orden/[id]:233-238`: `fieldOrderRef` → Link `pago/[id]`.
- [x] `alumnos/[personId]`: filas historial/próximas → Link
  `/academia/clases/[classId]` con chevron; migrar filas sueltas a
  `Card padded={false}` + `divide-y`.
- [x] `analitica/usuarios/[personId]`: actores con id → Link a su
  ficha; `dl`/`dt`/`dd` semántico en Row/SectionCard.
- [x] `QueryTable`: celda persona → Link cuando hay `personId`.

## 8. Transversales de patrón

- [x] `hover:border-neon/40` → `/60`: staff-section:188,
  instructor-section:110, payment-methods-admin:127.
- [x] `<section>` sin nombre → `div` o `aria-label`:
  `equipo/[id]:124`, `profesor/[id]:156`, `planes/[id]:128`.
- [x] `planes/[id]`: datos del plan → `dl`; delta KPI neon/warn →
  green-400/red-400; fallback Suspense y notFound con CTA en
  `planes/nueva`.
- [x] `metodos-de-pago/[methodId]`: zona destructiva canónica
  (`border-t pt-6`, ghost `text-red-400 hover:text-red-300`);
  notFound con CTA.
- [x] `preventas/page:83`: empty sin `role="status"`.
- [x] `video-form.tsx:72`: forbidden sin `role="alert"`.
- [x] Empty con filtros → `query.empty`: `cobros/reporte:311`,
  `videos` listado.
- [x] `ThemeToggle` segmented `min-h-9` → `min-h-11`.
- [x] `students-section`: CTA "+ Nuevo" a `justify-end`.
- [x] `academy-profile`: input file `hidden` → `sr-only`.
- [x] `instructor-section`: `FilterBar` + `EntityDef` (paridad con
  staff); cards → `<Card>`.
- [x] `AcademyPromoForm`: estado explícito de error al cargar planes
  (chips vacíos ≠ "todos").

## 9. Mantenedor de niveles al patrón

- [x] `/configuracion/niveles`: listado solo navegable.
- [x] `/configuracion/niveles/nuevo`: alta dedicada.
- [x] `/configuracion/niveles/[id]`: edición + zona roja delete con
  `ConfirmSheet`; 409 "en uso" → ActionNotice.

## 10. Promos refactor + navegación

- [x] `PromosModule`/`PromoDetailModule` con prop `academyId`
  (patrón planes/series); eliminar `queueMicrotask`.
- [x] `/promos/nueva`: tras ActionNotice → listado (no ficha).
- [x] Ficha promo: `pt-4`→`pt-6` en zona de acciones; retry con
  RefreshIcon.

## 11. Videos

- [x] Delete inline → `ConfirmSheet` (excepción documentada en
  `console-patterns` SKILL.md).

## 12. API: cap encuestas instructor

- [x] `GET /academies/:id/instructors/:personId/surveys`: `limit` de
  grupos (default 12, max 60) + cap 50 comentarios/grupo.
- [x] `survey-results.tsx`: `key` estable en comentarios (no `i`).

## 13. Verificación

- [x] `npx tsc --noEmit` web limpio.
- [x] `node scripts/i18n-audit.cjs` → `ALL_KEYS_OK`.
- [x] `pnpm --filter @omnidance/api build` (cap encuestas).
- [x] Smoke visual mobile+desktop en: cobros, alumnos/[id],
  planes/[id], preventas, niveles, promos, analitica/usuarios.

## 14. Docs e inventario

- [x] `docs/qa-flows-inventory.md`: nuevas rutas de niveles, cambio
  post-crear promo, expands.
- [x] `console-patterns` SKILL.md: excepción documentada de videos;
  patrón `SeeAllRow` en referencias canónicas.
- [x] `openspec validate --changes` verde y archivar al integrar.
