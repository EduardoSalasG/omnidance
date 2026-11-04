# Handoff: e2e-flow-tests cerrado y archivado

**Rama**: `dev`. Stack al cierre: DB/Redis en docker; API dev corriendo
con `PAYMENT_GATEWAY=stub` + `THROTTLE_AUTH_LIMIT=120` (no `pnpm dev`
normal); web sirviendo el **build de producción** con `next start` en
:3000 (no `next dev`). Para volver a dev normal: `pnpm dev`.

## Commit de la sesión

- `test(e2e): cierra e2e-flow-tests - corrida completa 46/46 y
  archivado` (change archivado como `2026-11-04-e2e-flow-tests`).

## Qué pasó (contexto que el handoff anterior no tenía)

- El stack "apagado" en realidad estaba arriba pero con `.next`
  corrupto: `/login` 500 con `SyntaxError: JSON.parse` fijo. Se
  reinició limpio y la corrupción **volvió dos veces** bajo la carga
  paralela de Playwright (8 y 4 workers): `next dev` no aguanta la
  corrida completa en esta máquina.
- Solución definitiva: corrida contra `pnpm --filter @omnidance/web
  build` + `next start` (mismas rewrites/proxy, mismo puerto). 46/46
  verdes en 2.1min vs 5.6min de fallos en dev. Documentado en
  AGENTS.md + inventory §0.
- `dancer-checkout`: la `.env` **raíz** trae `PAYMENT_GATEWAY=flow` +
  credenciales (apps/api/.env no las tiene - por eso el grep parecía
  limpio). Flow sandbox rechaza emails `*@omnidance.dev` → 500. El API
  para e2e corre con `PAYMENT_GATEWAY=stub` en el env del proceso
  (dotenv no pisa env existente). Decisión resuelta: stub.
- Fixes de spec: planes busca por `q` (paginación); chip de niveles
  por índice (locator `aria-pressed` re-resuelve; el test tampoco era
  idempotente porque el nivel queda persistido); tours marcados por
  `POST /me/onboarding` en auth.setup (el runner los dispara hasta
  ~8s tras el paint, fuera de la ventana de `dismissTours` - por eso
  academia-clases flajeaba interceptando clicks).
- polish-shots regenerados (PNGs difieren por render prod; errores de
  recurso externo SSL en consola - ruido ambiental, no regresión).

## Verificación (evidencia)

- `pnpm exec playwright test --project=chromium` → **46/46 verdes en
  2.1min** (incluye setup 7 logins) contra `next start` + API stub.
- `e2e-which.mjs --files` verificado: cobros → @cobros, sin regla →
  @smoke.
- `openspec validate --changes` verde; archive aplicado sin lock.

## Pendiente (backlog sin cambios)

- `customer/collect` automático por job (PlatformChargesService listo).
- Smoke visual superficies pasada B (clases, series, particulares, hub).
- multipais-foundation tasks 10/11/13 (épica).
- Corrida mobile/WebKit del suite (`--project` por separado; la
  verificación de cierre fue solo chromium según task 8).

## Notas operativas (vigentes)

- `git` no está en PATH: `export PATH="/c/Program Files/Git/bin:$PATH"`.
- Zombie/`.next` corrupto sigue siendo el modo de fallo dominante de
  `next dev` en esta máquina: matar node huérfanos, `rm -rf
  apps/web/.next`, reiniciar. Para e2e completo: `next start`.
- `openspec archive` lock stale: `rm
  openspec/changes/archive/.openspec-archive.lock` y reintentar.
