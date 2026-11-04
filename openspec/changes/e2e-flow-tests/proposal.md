# Proposal: e2e-flow-tests

## Why

La suite e2e actual cubre 3 golden paths sin organización por dominio,
sin tags y sin forma mecánica de saber qué correr tras tocar un
archivo. `docs/e2e-flow-tests-design.md` (ya aprobado como diseño)
define la convención: specs por flujo en `e2e/flows/`, tags dobles
`@dominio @flujo`, `flow-map.json` + `e2e-which.mjs` para gatillar por
diff, y tiers `@smoke`/`@visual`/`@destructive`.

## What Changes

Slice 1 - infraestructura + reordenamiento + primeros specs:

- `e2e/flow-map.json`: mapa path→tags (fuente única de "qué correr").
- `scripts/e2e-which.mjs` + script `test:e2e:which`: lee `git diff`,
  matchea prefijos, imprime tags y comando sugerido.
- `playwright.config.ts`: `grepInvert` excluye `@visual|@destructive`
  salvo `PW_ALL=1`.
- `e2e/helpers.ts`: `profe` en `USERS`, `dismissTours`,
  `acceptConsent`, `apiRequest` (webhook de pagos).
- Reorden: `notice-smoke` → `flows/transversal-notices`,
  `states-check` → `flows/transversal-states`, `video-ficha` →
  `flows/academia-videos`, `polish-visual` → `visual/` (`@visual`),
  `smoke.spec.ts` con tag `@smoke`.
- Specs nuevos: `flows/public-login` (login/logout/`?next=`/401) y
  `flows/transversal-gates` (bounce por rol).

Los 13 specs restantes del backlog priorizado quedan como tasks
pendientes del mismo change (cada uno es su propio slice verificable).

## Capabilities

Sin deltas de spec: es tooling de QA, no cambia comportamiento de
producto (`skip_specs: true`). El contrato de comportamiento que
cubren los specs ya vive en `openspec/specs/` y
`docs/qa-flows-inventory.md`.

## Impact

- `e2e/` (layout nuevo), `playwright.config.ts`, `package.json`,
  `scripts/e2e-which.mjs`.
- Documentación: `docs/qa-flows-inventory.md` referencia la convención;
  `docs/e2e-flow-tests-design.md` queda como diseño de referencia.
