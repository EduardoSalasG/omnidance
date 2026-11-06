# Tasks; academy-home-extended

## 1. Dashboard del owner

- [x] 1.1 `academy-dashboard.tsx`: eliminar el segmented control
  Simplificado/Extendido, el estado `homeMode` y las ramas
  condicionales del modo simple; el inicio renderiza siempre la vista
  extendida.
- [x] 1.2 Eliminar `SimpleHomeCards` (sin otros consumidores) y borrar
  `apps/web/src/lib/academy-home-mode.ts`; limpiar imports muertos.
- [x] 1.3 Subir `billedMonth` + `avgTicket` a la misma grilla del
  resumen en desktop (una sola sección "Resumen"); mobile queda
  apilado igual. Mantener landmarks/aria correctos (un landmark por
  sección, sin nombres duplicados).
- [x] 1.4 MiniKpi: quitar el `truncate` del título para que "Cobros
  por revisar" y "Planes que vencen esta semana" envuelvan en vez de
  cortarse.

## 2. Tour e i18n

- [x] 2.1 `HomeHub.tsx`: quitar el paso del tour sobre
  `[data-tour='academy-home-mode']` (anchor eliminado) y repoint del
  paso de facturación a `[data-tour='academy-kpi-billedMonth']`.
- [x] 2.2 `parts/academyExtras.json`: eliminar keys huérfanas de
  `academy.homeMode` (`label`, `simple`, `extended` y las del grupo
  sin uso) y la key `sections.billing` si queda sin uso.
- [x] 2.3 `parts/tours.json`: eliminar `tours.academiaOwner.s10`.

## 3. Verificación

- [x] 3.1 `cd apps/web && npx tsc --noEmit` limpio.
- [x] 3.2 `npx vitest run` de los tests que tocan la superficie.
- [x] 3.3 `node scripts/i18n-audit.cjs` → `ALL_KEYS_OK`.
- [x] 3.4 Actualizar `docs/qa-flows-inventory.md` (inicio owner sin
  toggle, facturación en la fila del resumen).
