# Tasks: survey-cards-dancer-lens

## Web

- [ ] 1. `HomeHub.tsx`: sección de encuestas solo con
  `activeRole === "DANCER"`; cards post-social solo en `viewMode ===
  "social"` (`dancerSocial`), cards de curso solo en `viewMode ===
  "academy"` (`dancerAcademy`). La sección no se monta si la lista del
  modo activo está vacía (cero hueco, como hoy).
- [x] 1. `HomeHub.tsx`: sección de encuestas solo con
  `activeRole === "DANCER"`; cards post-social solo en `viewMode ===
  "social"` (`dancerSocial`), cards de curso solo en `viewMode ===
  "academy"` (`dancerAcademy`). La sección no se monta si la lista del
  modo activo está vacía (cero hueco, como hoy).
- [x] 2. `packages/shared/src/index.ts`: `academy.courseSurvey` pasa a
  la lente `academy` en `NOTIFICATION_LENS_TYPES` (hoy "any" - se
  mostraba en ambas lentes de /notificaciones); rebuild de
  `@omnidance/shared`.
- [ ] 3. Verificar en el browser o con test de componente (si existe
  harness para HomeHub): owner de academia no ve la card de social;
  dancer modo Social ve solo la de social; dancer modo Academia ve
  solo la de curso.

## Docs / cierre

- [ ] 4. `docs/qa-flows-inventory.md`: flujo de cards de encuesta por
  lente actualizado; archivar el change.
