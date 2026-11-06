# Proposal: academy-sidebar-switcher

## Why

El owner multi-academia solo puede cambiar de academia desde el hub
(`/inicio` o `/academia`). Como la consola del owner es drawer-only,
volver al hub para cambiar de contexto es fricción innecesaria: el
cambio de academia debe vivir en la navegación misma (drawer móvil y
sidebar desktop), donde el owner ya opera.

## What Changes

- Nuevo switcher de academia en el chrome de navegación (SideDrawer
  móvil y AppSidebar desktop), montado arriba de los grupos de ítems
  cuando la lente activa es `ACADEMY_OWNER`.
- Visible solo cuando el owner tiene más de una academia propia o
  alguna academia propia cubre `multiAcademy` (misma regla de negocio
  que `POST /academies`); la opción "+ Nueva academia" sigue el gate
  vigente del hub (rol ACADEMY_OWNER + tier `multiAcademy`, con bypass
  de admin de plataforma).
- La selección sigue persistiendo en `localStorage["omnidance:academy-id"]`
  y se propaga sin reload mediante un evento `omnidance:academy-changed`:
  `AcademyGate` actualiza su `selectedId` y los entitlements de la
  lente se re-resuelven contra la academia elegida.
- El selector del hub (`AcademyGate selector`) se mantiene como está:
  el switcher de la nav es una segunda superficie del mismo estado
  persistido, no un reemplazo.

## Capabilities

### New Capabilities

(ninguna)

### Modified Capabilities

- `academies/console-lists`: el requirement "crear otra academia desde
  la consola" se extiende (o se agrega un requirement hermano) para que
  el selector de academia viva también en el drawer/sidebar de la lente
  ACADEMY_OWNER, con su regla de visibilidad (`owned.length > 1` o
  `multiAcademy` en alguna propia), dedup de opciones igual al del hub
  y propagación del cambio por evento sin recarga.

## Impact

- `apps/web/src/components/layout/BottomNav.tsx` (monta el switcher,
  re-render al evento para re-filtrar ítems por feature).
- `apps/web/src/components/layout/AppSidebar.tsx` y `SideDrawer.tsx`
  (slot de header/contenido superior para el switcher).
- Nuevo componente compartido del switcher (fetch `/academies/mine`,
  dedup por id+nombre, lectura/escritura de la key persistida,
  dispatch del evento).
- `apps/web/src/components/academy/academy-gate.tsx` (listener del
  evento → `selectedId`).
- `apps/web/src/lib/entitlements-context.tsx` (re-resolver la
  selección persistida cuando llega el evento).
- i18n: reutiliza `academy.title` / `academy.newAcademy`; sin keys
  nuevas salvo que la maqueta lo pida.
- `docs/qa-flows-inventory.md` (nuevo flujo de cambio de academia
  desde la nav), `omni-dance.md` y `docs/architecture.md` se
  actualizan en el mismo cambio.
