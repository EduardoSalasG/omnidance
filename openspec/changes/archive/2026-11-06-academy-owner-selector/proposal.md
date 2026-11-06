# Proposal: academy-owner-selector

## Why

El selector de academia quedó inalcanzable para el dueño: `AcademyGate`
lo renderiza solo detrás de la prop `selector`, que únicamente pasa el
hub `/academia`, y esa página redirige al owner a `/inicio`, donde el
gate se monta sin `selector`. Regresión introducida por dos cambios que
se cruzaron: el redirect del owner a `/inicio` (oct 15) y el selector
opt-in solo en hub (oct 29, commit `3d400223`).

Consecuencias reales: un owner multi-academia no puede cambiar de
academia por UI (queda atado a `localStorage`) y la opción "Nueva
academia" (feature `multiAcademy`, PRO) tampoco es alcanzable, porque
vive dentro del mismo selector.

## What Changes

- `AcademyGate selector` también en el home del owner (`/inicio`,
  `HomeHub`): restaura el cambio de academia y el CTA "Nueva academia"
  en la consola del dueño, mismo control persistido en
  `omnidance:academy-id`.
- El hub `/academia` conserva el selector para staff/instructor/ADMIN
  (su consola sí vive ahí).
- Sin cambios de API ni de contratos: es montar la prop que ya existe.

## Capabilities

- **Modified Capabilities**: `academies/console-lists` - el
  requirement "crear otra academia desde la consola" ubica el CTA
  "junto al selector" en "la consola `/academia`"; la consola del owner
  es `/inicio` desde el change que embebió el dashboard en `HomeHub`.
  El delta actualiza el anclaje de la superficie (selector + CTA en el
  home del owner; selector también en el hub para el resto del equipo).

## Impact

- `apps/web/src/components/home/HomeHub.tsx`: `<AcademyGate selector>`.
- Sin impacto en datos, API, seed ni contratos.
- `docs/qa-flows-inventory.md` §8: línea del home del owner menciona el
  selector restaurado.
