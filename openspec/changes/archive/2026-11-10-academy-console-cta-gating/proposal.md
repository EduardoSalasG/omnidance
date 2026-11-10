# Proposal: CTAs de consola coherentes con el tier y una sola acción de crear

## Resumen

QA sobre una academia tier COBROS encontró tres fugas del modelo de
consola:

1. `/academia/series` y `/academia/equipo` muestran el paywall del
   tier pero el botón de crear del `ConsoleHeader` queda visible
   (vive fuera del `AcademyTierGate`).
2. El selector de academia del hub (`AcademyGate`) aparece con una
   sola academia propia y sin `multiAcademy` porque su condición usa
   `canCreate` (rol) en vez de `canAddAcademy` (permiso real).
3. `/academia/promos` y `/academia/series` duplican el CTA de crear:
   header + botón dentro del empty state. La regla queda explícita:
   un solo CTA de crear por pantalla (el del header).

## Alcance

- `series/page.tsx` y `equipo/page.tsx`: el CTA del `ConsoleHeader`
  se renderiza solo cuando `academyHasFeature(academy, feature)` lo
  cubre (el header pasa dentro del render-prop del `AcademyGate`).
- `academy-gate.tsx`: visibilidad del selector `academies.length > 1
  || canAddAcademy` (misma regla que `AcademySwitcher`).
- `promos/page.tsx` y `series/page.tsx`: se elimina el botón de crear
  del empty state (el del header permanece).
- `console-patterns` skill: regla "un solo CTA de crear por pantalla"
  ya escrita (empty state = mensaje solo).

## Fuera de alcance

- Cambios de API: los endpoints ya devuelven 403 `tier.required` como
  red de seguridad; esto es solo alinear la UI.
- Reubicar el selector del hub al sidebar exclusivamente (sigue en
  hub + navegación según spec console-lists).
