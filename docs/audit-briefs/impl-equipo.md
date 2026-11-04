# Brief: impl-equipo (equipo + API encuestas)

Lee `docs/audit-briefs/_impl-common.md` primero. Tu scope exclusivo:

- `apps/web/src/components/academy/staff-section.tsx` — 403 por cap →
  estado sin-acceso (l104-106,165-177); card hand-rolled → `<Card>`
  (l186-188); `hover:border-neon/40` → `/60`.
- `apps/web/src/components/academy/instructor-section.tsx` — agregar
  `FilterBar` + `EntityDef` (paridad con staff-section); mismo 403
  (l42-44,91-101); card → `<Card>` (l108-110); hover /60.
- `apps/web/src/components/academy/staff-form.tsx` — busy texto →
  `Spinner` inline (l271-273).
- `apps/web/src/app/[locale]/(app)/academia/equipo/[id]/page.tsx` —
  `<section>` identidad sin nombre → `aria-label` o `<div>` (l124).
- `apps/web/src/app/[locale]/(app)/academia/equipo/profesor/[id]/page.tsx`
  — mismo landmark (l156).
- `apps/web/src/app/[locale]/(app)/academia/equipo/profesor/[id]/editar/page.tsx`
  — `role="radiogroup"` redundante en div interno (l180): quitar.
- `apps/web/src/components/academy/survey-results.tsx` — preview de
  grupos mes×serie con `SeeAllRow` (preview 3: `preview={3}`) +
  comentarios por grupo acotados igual; `key` estable (no índice,
  l131).
- `apps/api/src/academies/academies.controller.ts` — endpoint
  `GET /academies/:id/instructors/:personId/surveys` (~l1408-1412):
  aceptar `limit` de grupos (default 12, max 60, clamp) y capar
  comentarios a 50 por grupo (~l1469). Ajustar el servicio que
  corresponda; sin cambio de forma de respuesta.
- API: `cd apps/api && npx tsc --noEmit` al final (o el build del
  paquete).
