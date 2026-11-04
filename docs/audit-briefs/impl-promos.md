# Brief: impl-promos

Lee `docs/audit-briefs/_impl-common.md` primero. Tu scope exclusivo:

- `apps/web/src/app/[locale]/(app)/academia/promos/page.tsx` —
  extraer `PromosModule` con prop `academyId` y montarlo como
  `<PromosModule key={academy.id} academyId={academy.id}/>` (patrón
  `PlansModule` en `planes/page.tsx`); eliminar el
  `queueMicrotask` (~l97-99). Agregar `ConsoleHeader` back →
  `/academia` (raíz drawer, design §1).
- `apps/web/src/app/[locale]/(app)/academia/promos/[id]/page.tsx` —
  mismo refactor `PromoDetailModule` (l141-143); zona de acciones
  `pt-4` → `pt-6` (l243); retry con `RefreshIcon` (l155-161).
- `apps/web/src/app/[locale]/(app)/academia/promos/nueva/page.tsx` —
  tras ActionNotice navegar a `/academia/promos` (no a la ficha,
  l55).
- `apps/web/src/components/academy/academy-promo-form.tsx` — estado
  explícito de error al cargar planes (l57-67): si el fetch falla no
  mostrar chips vacíos como "aplica a todos" — error con retry o
  bloqueo del submit con aviso. PersonPicker fallo silencioso: al
  menos `role="alert"` o hint (l276-289).
