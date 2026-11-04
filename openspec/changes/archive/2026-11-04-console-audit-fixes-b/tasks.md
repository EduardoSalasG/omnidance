# Tasks

## Bugs (bloqueantes)

- [x] 1. `series/[id]/page.tsx` `remove()`: `finally { setBusy(false) }`.
- [x] 2. `horarios/[slotId]/page.tsx` `save()`: try/catch/finally +
  ActionNotice de error (como `remove`).

## Hub / gates transversales

- [x] 3. `use-academy-access.ts`: nuevo `useAcademyAccessState`
  `{access, state, reload}`; `academia/page.tsx` muestra
  `role="alert"` + retry ante fallo de `/access` (hook original intacto
  por compat con `alumnos/page.tsx`).
- [x] 4. `academy-gate.tsx`: `role="alert"` en el `<p>` de error;
  `empty` sin `canCreate` → "sin acceso" + CTA (ya no muestra
  CreateAcademyForm).
- [x] 5. `academy-dashboard.tsx`: MiniKpi con `title`+`aria-label`
  compuesto + hover `/60`; chevrons en TodayClassesCard, BirthdaysCard
  y checklist; SimpleHomeCards limpiado (vars/props muertas -
  simplificado ya cubre esas colas vía Operación del día); `;`
  huérfanos; landmarks duplicados; error de fetch único en Extendido.
- [x] 6. `academy-kpi-strip.tsx`: deltas `text-green-400`/
  `text-red-400`/`text-ink/50` + prop `ariaLabel`.
- [x] 7. `academy-levels-card.tsx`: slot cards con Link + focus-visible
  + hover `/60` + chevron; variante compact navega; fallback del link a
  la ficha del slot (`seriesId` agregado al payload bySlot);
  ToggleChips `min-h-11`.
- [x] 8. `module-grid.tsx`: `aria-label={t("modules.gridLabel")}`.
- [x] 9. `academy-visibility-card.tsx` + `instructor-checklist.tsx`:
  chips `min-h-11` y `role="group"` con `label` opcional.

## Series / horarios

- [x] 10. `series/page.tsx`: empty con CTA crear + `query.empty` por
  filtros; 403 → forbidden con CTA; `useMemo` fuera.
- [x] 11. `series/[id]/page.tsx`: 404 → `notFound` + CTA; 403 →
  forbidden; fetch de clases con error visible + retry por sección;
  dead code fuera (`kind:"slot"`, `removeSlot`, fetch `instructors`);
  `Series.instructors` en `shared.ts`; Spinner en mini-form;
  `invalidTimeRange`; focus-visible en filas de slots; `slotsEmpty`.
- [x] 12. `series/nueva/page.tsx`: Suspense `PageLoading`; notFound con
  CTA.
- [x] 13. `series-form.tsx`: Spinner en submit; validación
  `startTime < endTime` en drafts.
- [x] 14. `horarios/[slotId]/page.tsx`: `<Suspense>` boundary,
  `AcademyTierGate feature="classes"`, `ConsoleHeader` permanente en
  SlotChrome, forbidden/notfound sin `role="alert"`, `slotNotFound`,
  `grid-cols-1 sm:grid-cols-3`, `<form>` real con `required` nativo,
  `label` en InstructorChecklist.
- [x] 15. `series-insights.tsx`: chevron en filas rank.
- [x] 16. `survey-results.tsx`: `limit=60` en la query (inerte hoy: el
  endpoint `/surveys` no implementa limit - queda documentado).

## Clases / asistencia

- [x] 17. `clases/[id]/page.tsx`: forbidden/notfound con CTA (sin
  `role="alert"`); `markPresent` con `Spinner` + ActionNotice
  `instructor.marked`; links de nombre `min-h-11`; `SlotCupos` error
  con retry; back con `seriesId=null` → `/academia/series`.
- [x] 18. `teaching-classes.tsx`: chevron en cards; forbidden con CTA;
  empty distingue filtros (`query.empty`).
- [x] 19. `asistencia/page.tsx`: redirect → `/academia`.

## Particulares

- [x] 20. `private-lessons.controller.ts`: list + KPIs scopeados a
  `instructorId=me` para instructor puro + spec 31/31.
- [x] 21. `private-lessons.tsx`: `role="alert"` en error; empty con
  `tq("empty")`; Spinner en acciones; prop `academies`, `;` y `shortId`
  duplicado fuera; `instructorsError` bajo el select de assign.

## i18n + docs + cierre

- [x] 22. Keys: `academySeries.slotNotFound`,
  `academySeries.invalidTimeRange`, `academySeries.slotsEmpty`,
  `instructor.marked`, `academyExtras.lessons.instructorsError`,
  `academy.modules.gridLabel` (4 locales). `i18n-audit` ALL_KEYS_OK.
- [x] 23. `docs/qa-flows-inventory.md`: particulares scopeado +
  redirect asistencia actualizados.
- [x] 24. `tsc --noEmit` api+web limpio, spec private-lessons 31/31,
  archivar change.
