# Brief: levantamiento de tests automatizados por flujo (read-only → doc)

El usuario quiere: tras modificar algo, que existan pruebas
Playwright por flujo y una forma de saber QUÉ test gatillar según el
flujo tocado. Diseña el sistema y escribe
`docs/e2e-flow-tests-design.md` con:

1. **Inventario de flujos** tomado de `docs/qa-flows-inventory.md`
   (ya está organizado por dominio/ruta — mapear secciones → specs).
2. **Estructura propuesta**: cómo organizar specs en `e2e/` por
   dominio (auth.setup ya existe con storageStates por rol +
   `e2e/.auth/*.json`; `playwright.config.ts` baseURL QA_BASE_URL),
   convención de nombres `e2e/flows/<dominio>-<flujo>.spec.ts`, tags
   (`@alumnos`, `@cobros`...) para `--grep`.
3. **Mapa flujo→test**: tabla ruta/superficie → spec(s) que la cubre
   + comando exacto para correr solo ese flujo (`pnpm exec playwright
   test --grep @alumnos --project=chromium` o por archivo).
4. **Convención "qué correr tras tocar X"**: regla simple (mapping
   path→tags en el doc o un `e2e/flow-map.json` que un script lea y
   sugiera specs por archivos en `git diff`). Propón el más simple de
   mantener.
5. **Specs ya existentes**: `smoke.spec.ts`, `polish-visual.spec.ts`,
   `notice-smoke.spec.ts`, `auth.setup.ts` — cómo encajan.
6. Lista priorizada de los 10-15 primeros flujos a spec-ar
   (happy path + estados clave: error-retry, forbidden, empty) y qué
   datos seed usa cada uno.

NO edites código ni tests: solo el doc. Referencias: lee
`playwright.config.ts`, `e2e/helpers.ts`, un spec existente, y la
estructura de `docs/qa-flows-inventory.md`.
