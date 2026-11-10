# Tasks: academy-console-cta-gating

## Web

- [x] 1.1 `series/page.tsx`: `ConsoleHeader` dentro del render-prop
  del `AcademyGate`; `actions` condicionado a
  `academyHasFeature(academy, "classes")`. Eliminar el botón `+
  Nueva` del empty state (queda el texto).
- [x] 1.2 `equipo/page.tsx`: mismo tratamiento con `feature="staff"`.
- [x] 1.3 `promos/page.tsx`: eliminar el `Button` secondary `+
  Nueva promo` del empty state (queda el texto).
- [x] 1.4 `academy-gate.tsx`: condición del selector `academies.length
  > 1 || canAddAcademy` (reemplaza `canCreate`).

## Cierre

- [x] 2.1 `docs/qa-flows-inventory.md`: la sección de la consola
  academia documenta que los CTAs de crear respetan el tier y que el
  selector de academia exige >1 membresía o `multiAcademy`.
- [x] 2.2 Verificación: typecheck web OK, `openspec validate
  --changes` OK.
