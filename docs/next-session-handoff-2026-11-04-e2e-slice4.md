# Handoff: e2e-flow-tests slice 4 (tasks 15-18 verdes)

**Rama**: `dev`. Stack dev vivo en background de esta sesión
(api :4000 con `THROTTLE_AUTH_LIMIT=120`, web :3000). DB/Redis en
docker. `pnpm db:enrich` vigente.

## Commit de la sesión

- `3612f62f` test(e2e): specs dancer-membresia, productor-eventos,
  productor-colaboradores, staff-puerta (tasks 15-18) + absorción del
  describe productor del smoke + tasks.md + nota landings estáticas.

## Estado del change `e2e-flow-tests` (ABIERTO)

**Tasks 9-21 todas verdes.** Quedan abiertas: task 8 (verificación del
slice 1: corrida completa chromium + `e2e-which` + inventory §0) y la
task 10 `dancer-checkout` está `[~]`: el spec existe pero en dev el
gateway real es FLOW (`payments.default_gateway=FLOW` en params) sin
FLOW_API_KEY → toda orden sale 500 ("userEmail ... not valid"). Para
verde hay que correr la API con gateway stub (param a STUB o env) -
decidir si se muta el param en dev o se documenta como skipped.

## Aprendizajes del slice

- **Gateway dev**: `payments.default_gateway=FLOW` y
  `payments.subscription_gateway=FLOW` en PlatformParam; `.env` no
  tiene FLOW_API_KEY → `POST /checkout/ticket` sale 500. Para specs
  que necesitan entrada ACTIVE sin cobro: EntryPass LIST por
  guest-list como admin:
  `POST /api/events/:id/guest-lists {ownerId}` →
  `POST /api/guest-lists/:id/entries {personId}` →
  `POST /api/guest-lists/:id/entries/:entryId/pass` (social.manage).
- **Cutoff de preventa**: `min(start - presaleCutoffMinutes, 19:00 del
  día del evento)` - un evento de hoy corrido de noche ya pasó el
  corte (400 "La preventa cerró a las 19:00"). Crear eventos QA a
  mañana si el spec compra por preventa.
- **ActionNotice roles**: éxito → `role="status"`, error →
  `role="alert"`; auto-dismiss ~3s: asertar inmediato o verificar el
  estado real por API en vez del notice efímero.
- **Plan QA por API** (`POST /api/academies/:id/plans` {name,type:
  MONTHLY,price,periodDays}) para que el checkout de membresía sea
  re-corrigible (una sub ACTIVE previa solo mostraría
  alreadySubscribed).
- **Clipboard en Playwright**: `test.use({permissions:["clipboard-read",
  "clipboard-write"]})` + `page.evaluate(() => navigator.clipboard
  .readText())`.
- **Multi-actor**: `browser.newContext({storageState:statePath(role)})`;
  `acceptConsent(page)` tras goto.
- **Flakes de infra vistos**: zombie :3000 resucitó de nuevo (3.9GB,
  taskkill al PID listener + `rm -rf apps/web/.next`); API se
  reinició sola mid-run (ECONNREFUSED transitorio, re-correr); ENOENT
  de trace artifacts → `rm -rf test-results` y re-correr.
- **Compiles fríos**: calentar rutas con cookie antes de correr
  (`curl -H "cookie: omnidance_session=..." localhost:3000/<ruta>`);
  sin auth devuelve 307 y no compila la página.

## Pendiente (orden sugerido)

- **Landings 100% estáticas** (pedido del usuario 2026-11-04):
  eliminar requests al API desde `(marketing)`. Diagnóstico en
  `next-session-handoff-2026-11-04-e2e-infra.md` §Pendiente.
  **Restricción del usuario:** estático ≠ contenido quemado - la data
  sigue en JSONs/catálogos editables (i18n parts, archivos de
  contenido). Crear change OpenSpec al tomarlo.
- **e2e-flow-tests cierre**: task 8 (corrida completa + e2e-which +
  inventory §0) y decisión dancer-checkout (stub vs skip) → luego
  `openspec archive`.
- `customer/collect` automático por job (pendiente desde cierre-2).
- Smoke visual superficies pasada B.
- multipais-foundation tasks 10/11/13 (épica).

## Notas operativas (vigentes)

- Specs e2e: `pnpm exec playwright test e2e/flows/<spec>
  --project=chromium --no-deps` (storageStates existen en e2e/.auth).
- `role="alert"` ambiguo: el `__next-route-announcer__` también lo es
  - filtrar por texto del aviso.
- `?genre=` inválido se ignora: empty por `?venue=<inexistente>`.
- `openspec archive` lock stale: `rm
  openspec/changes/archive/.openspec-archive.lock` y reintentar.
