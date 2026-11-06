# Brief: impl-cobros (tasks 3, 4-fichas, 5-cobros, 7-cobros, 8-reporte)

Lee `docs/audit-briefs/_impl-common.md` primero. Tu scope exclusivo:

- `apps/web/src/components/academy/claims-queue.tsx` — (a) propagar
  error de fetch → `role="alert"` + retry en vez de tragarlo
  (l77-79,89); (b) cola PENDING: preview 20 + `SeeAllRow`
  (`preview={20}`); historial resuelto: `LIST_PREVIEW` + `SeeAllRow`.
- `apps/web/src/components/academy/order-claims-queue.tsx` — mismo
  tratamiento de error (l82).
- `apps/web/src/components/academy/cobros-history.tsx` — mismo
  tratamiento de error (l76-90).
- `apps/web/src/components/academy/academy-dashboard.tsx` —
  `ExpiringList` (l813-835): agregar `ChevronRightIcon` al filo
  derecho de filas navegables. SOLO ese bloque.
- `apps/web/src/app/[locale]/(app)/academia/cobros/claim/[id]/page.tsx`
  — 401/403/404 → estado "sin acceso" (l103-105); `person.name` →
  Link a `/academia/alumnos/${claim.person.id}` (l197).
- `apps/web/src/app/[locale]/(app)/academia/cobros/orden/[id]/page.tsx`
  — mismo forbidden (l115-117); `person.name` → Link (l211);
  `fieldOrderRef` → Link a `/academia/cobros/pago/[id]` (l233-238).
- `apps/web/src/app/[locale]/(app)/academia/cobros/pago/[id]/page.tsx`
  — forbidden discriminatorio (l87-89).
- `apps/web/src/app/[locale]/(app)/academia/cobros/reporte/page.tsx`
  — empty con filtros activos → `query.empty` (l311-313).

Referencia de estados canónicos: la propia `claim/[id]` ya tiene el
patrón para copiar (skeleton, alert+retry, ActionNotice).
