# Brief: impl-alumnos (alumnos + planes + preventas)

Lee `docs/audit-briefs/_impl-common.md` primero. Tu scope exclusivo:

- `apps/web/src/app/[locale]/(app)/academia/alumnos/[personId]/page.tsx`
  — (a) expands con `SeeAllRow`: Pagos/enrollments (~l378-406),
  Historial (~l466-488), Próximas (~l506-529); (b) filas de
  historial/próximas → `Link` a `/academia/clases/${classId}` con
  chevron (como `series/[id]:559-584`); (c) migrar las 4 secciones de
  `<li>` sueltos `rounded-xl border` a `Card padded={false}` +
  `divide-y divide-line` + filas `px-4 min-h-11`; (d) botón Guardar
  (~l324-331): `Spinner` inline en busy.
- `apps/web/src/components/academy/students-section.tsx` — CTA
  "+ Nuevo" a `<div className="flex justify-end">` (l161-167).
- `apps/web/src/app/[locale]/(app)/academia/planes/page.tsx` —
  `ConsoleHeader` back → `/academia` (raíz drawer, ver design §1);
  delta KPI `text-neon`/`text-warn` → `text-green-400`/`text-red-400`
  (~l237-243).
- `apps/web/src/app/[locale]/(app)/academia/planes/[id]/page.tsx` —
  `<section>` sin nombre → `<div>` (l128); datos del plan → `<dl>`
  dt/dd (l149-166); alumnos vigentes → LIST_PREVIEW + `SeeAllRow`
  (l192-212, conservar Link a ficha alumno).
- `apps/web/src/app/[locale]/(app)/academia/planes/nueva/page.tsx` —
  fallback de `Suspense` → `SkeletonList`; notFound con CTA (l93,104).
- `apps/web/src/app/[locale]/(app)/academia/preventas/page.tsx` —
  separar pendientes (INVITED) de resueltos: resueltos con
  LIST_PREVIEW + `SeeAllRow` (~l90-152); empty quita `role="status"`
  (l83).
- `apps/web/src/app/[locale]/(app)/academia/preventas/[id]/page.tsx` —
  códigos emitidos: preview + `SeeAllRow` (~l311-341); busy texto →
  `Spinner` inline (~l304,355).
