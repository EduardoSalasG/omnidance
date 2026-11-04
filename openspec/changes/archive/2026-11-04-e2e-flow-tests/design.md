# Design: e2e-flow-tests

El diseño completo vive en `docs/e2e-flow-tests-design.md` (convenciones,
tabla inventario→dominios, mapa de rutas, backlog priorizado y riesgos).
Este doc solo fija las decisiones del slice 1.

## Decisiones del slice

- **`skip_specs: true`**: la suite e2e es tooling; las capacidades de
  producto que ejercita ya tienen spec canónica. Un spec "de los tests"
  duplicaría el design doc sin añadir contrato.
- **`video-ficha.spec.ts` → `flows/academia-videos.spec.ts`** con tags
  `@academia @videos`: ya es un spec de flujo (navega, edita, vuelve);
  el screenshot queda como evidencia pero el spec corre en el default.
- **`states-check.spec.ts` → `flows/transversal-states.spec.ts`** tags
  `@transversal @states`: `page.route()` simula la API caída, es
  determinístico y corre en el default (no necesita API apagada).
- **`profe` en `USERS`**: se agrega ahora porque el storageState se
  genera en el setup; cuesta un login más (cubierto por
  `THROTTLE_AUTH_LIMIT=120` en dev, ya documentado en AGENTS.md).
- **`flow-map.json` con prefijos reales del repo**: las rutas del
  diseño se verifican contra el árbol real (`apps/web/src/app/[locale]`
  existe como path literal en Windows; las reglas usan ese prefijo
  literal para que el match por prefijo funcione con `git diff`).
- **`e2e-which.mjs`**: cero dependencias; lee `git diff --name-only
  <base>` (default `HEAD` con unstaged; `--base origin/dev...HEAD`
  para rama), imprime tags deduplicados en orden + comando
  `pnpm test:e2e --grep "@a|@b" --project=chromium`. Sin match →
  `defaultTags`.
- **Specs del slice**: `public-login` (sin storageState: prueba el
  propio login) y `transversal-gates` (bounce dancer→/academia,
  anon→/eventos con `?next=`). El resto del backlog queda en tasks.

## Verificación

`pnpm test:e2e --project=chromium` con stack vivo + seed + enrich:
verde en specs corridos. `node scripts/e2e-which.mjs` imprime tags
sensatos ante diff de prueba.
