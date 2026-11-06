# Brief: impl-config (configuración + niveles + ThemeToggle)

Lee `docs/audit-briefs/_impl-common.md` primero. Tu scope exclusivo:

- ConsoleHeader back → `/academia` en estas subpáginas que lo omiten
  (un solo componente al tope del `<main>`):
  `configuracion/clases/page.tsx`, `configuracion/perfil/page.tsx`,
  `configuracion/apariencia/page.tsx`, `configuracion/importar/page.tsx`,
  `configuracion/suscripcion/page.tsx`,
  `configuracion/metodos-de-pago/page.tsx`,
  `configuracion/metodos-de-pago/nuevo/page.tsx`. OJO: las que YA lo
  tienen no se duplican — verifica antes de agregar.
- `configuracion/niveles/` — refactor completo al patrón
  (design §9): listado solo navegable (filas → página de edición);
  nuevo `/configuracion/niveles/nuevo/page.tsx` (alta dedicada);
  nuevo `/configuracion/niveles/[id]/page.tsx` (editar + zona roja
  delete con `ConfirmSheet`, 409 "en uso" → ActionNotice). Reusar la
  lógica de la page actual (read l196-291); endpoints ya existen.
  `ConsoleHeader` en las 3 páginas.
- `configuracion/metodos-de-pago/[methodId]/page.tsx` — zona
  destructiva canónica: `border-t border-line pt-6`, centrada,
  `Button variant="ghost"` `text-red-400 hover:text-red-300`
  (l294-303); `methodNotFound` con CTA (l183).
- `apps/web/src/components/academy/payment-methods-admin.tsx` —
  `hover:border-neon/40` → `/60` (l127).
- `apps/web/src/components/academy/import-section.tsx` — tabla de
  resultados CSV: preview 10 + expand (puede ser scroll de filas con
  `SeeAllRow` fuera de la tabla si `<li>` no aplica — decide
  implementación consistente con el patrón visual).
- `apps/web/src/components/academy/academy-profile.tsx` — input file
  `className="hidden"` → `sr-only` (l288).
- `apps/web/src/components/layout/ThemeToggle.tsx` — variante
  segmented `min-h-9` → `min-h-11` (l91).
