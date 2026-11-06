# Proposal: console-audit-fixes-b

## Why

La pasada B de la auditoría (`docs/console-audit-2026-11-04-b.md`)
cubrió las secciones que faltaban: asistencia, horarios, clases/series,
particulares y el hub `/academia`. Encontró 2 bugs que congelan la UI
(`busy` sin `finally` en `remove()` de la ficha de serie y `save()`
sin try/catch en la ficha de horario), ~15 gaps del patrón
console-patterns y ~30 menores.

## What Changes

- **Bugs funcionales**: `finally` en `remove()` de `series/[id]`;
  try/catch/finally en `save()` de `horarios/[slotId]`.
- **Estados explícitos**: forbidden/notfound con CTA en roster y
  teaching-classes; 404 con copy `notFound` (no "empty") en
  `series/[id]`; fetch de clases deja de tragar errores; error con
  `role="alert"` en `academy-gate` y `private-lessons`; error con retry
  en el fetch de `/access` del hub (hoy deja el hub sin ModuleGrid).
- **Affordance/a11y**: chevrons en cards/filas navegables
  (teaching-classes, filas hoy/cumpleaños, rank de insights, slot
  cards); focus-visible en filas de slots y links; MiniKpi con hint en
  `title`+`aria-label`; deltas de KPI al color semántico de la skill;
  `role="group"` nombrado; `aria-label` de ModuleGrid por catálogo.
- **Gates**: `AcademyTierGate` + `Suspense` + `ConsoleHeader`
  permanente en ficha de horario; redirect de `/academia/asistencia` al
  hub (resuelve por lente) en vez de a `/academia/series` (owner-only).
- **Particulares**: `GET /academies/:id/private-lessons` scopea al
  `instructorId` del caller cuando es instructor puro (sin
  staff/owner/admin) para no exponer lecciones ajenas en deep-link.
- **Limpieza**: dead code (`kind:"slot"` del ConfirmSheet, `removeSlot`,
  fetch `instructors` sin consumidor, `useMemo`, prop `academies`, `;`
  sueltos, `shortId` duplicado); busy-texto → `Spinner` inline (3
  sitios); `series.instructors` declarado en el tipo `Series`.
- i18n: `academySeries.slotNotFound`, `academySeries.invalidTimeRange`,
  `academy.clases.marked`, label de ModuleGrid (4 locales).

## Capabilities

- **Modified Capabilities**: `academies/private-lesson-product` - el
  listado de particulares se scopea al instructor puro.

## Impact

- API: `private-lessons.controller.ts` (+ spec).
- Web: ~20 archivos de consola academia (gates, dashboard, series,
  clases, particulares, niveles/insights, horarios, asistencia
  redirect).
- i18n parts + mirrors; `docs/qa-flows-inventory.md` (particulares y
  secciones tocadas).
