# Handoff: platform-charges.collect implementado + smoke visual pasada B

**Rama**: `dev`. Stack al cierre: DB/Redis en docker; API dev con
`PAYMENT_GATEWAY=stub` + `THROTTLE_AUTH_LIMIT=120`; web en `next start`
(prod build). Para dev normal: `pnpm dev`.

## Commits de la sesión

- `feat(payments): job platform-charges.collect - reintento de cobros
  sueltos impagos` (change `platform-charges-retry` archivado como
  `2026-11-05-platform-charges-retry`, spec +1 requirement en
  payments/platform-charges).
- (sesión anterior) `test(e2e): cierra e2e-flow-tests` + handoffs.

## platform-charges.collect (decisión del usuario)

- Alcance acotado: **reintentar PLATFORM_CHARGE PENDING**, no nueva
  fuente de deuda.
- `PlatformChargesService.retryPending(actor)`: barrido FIFO de
  PLATFORM_CHARGE PENDING sobre el MISMO Payment (sin duplicar) -
  `COLLECT_ATTEMPT` por intento antes de llamar al proveedor, tope
  param `platform_charges.retry.max_attempts` (default 5), subject
  desde el payload de ORDER_CREATED, commerceOrder = refId original,
  abort en error transitorio. Retorna contadores → JobRun.meta.
- `PlatformChargesScheduler`: job `platform-charges.collect` default
  `30 9 * * *` (30min tras subscriptions.reconcile) - administrable
  desde /admin/jobs.
- Evidencia: platform-charges.service.spec 12/12 verde (5 casos
  nuevos), `tsc --noEmit` limpio, `openspec validate` verde.
- **Sin smoke real del job contra DB** - la lógica está cubierta por
  specs con prisma mockeado; una corrida real `POST /admin/jobs/
  platform-charges.collect/run` queda como verificación opcional.

## Smoke visual pasada B (academy, es-CL)

8/8 rutas renderizan (desktop 1280 + mobile 390): /academia hub,
/academia/clases, /academia/series, /academia/particulares. Sin
crashes ni layout roto.

Hallazgos:

- **QUÓRUM > cupo**: cards de Mis clases muestran `QUÓRUM 30/15`,
  `26/15`, `23/15` - la barra renderiza full-width bien, pero el
  seed/enrich siembra asistentes por sobre el cupo. Revisar
  `enrich-academy-seed.cjs` (capacidad vs asistencias sembradas).
- Residuos e2e esperados (`QA Profe`, `Taller PW` ×2) - sin acción.
- Shots salen en tema claro: el storageState de academy tiene
  theme=light; dark-first es solo el default sin preferencia.

## Pendiente

- `pnpm db:enrich` sin correr (de handoff console-polish).
- Smoke visual restante: ficha de clase/serie (detalle), y las
  superficies restantes de la pasada B si el alcance original era más
  amplio (clases, series, particulares, hub cubiertos).
- `GET /academies/:id/surveys` limit inerte (limit=60).
- `academySeries.creating` posible clave i18n huérfana.
- multipais-foundation tasks 10/11/13 (épica).
- Corrida mobile/WebKit del suite e2e.

## Notas operativas (vigentes)

- `git` no está en PATH: `export PATH="/c/Program Files/Git/bin:$PATH"`.
- Corrida e2e completa: `next build` + `next start` en :3000 + API
  `PAYMENT_GATEWAY=stub` (ver AGENTS.md - `next dev` corrompe `.next`
  bajo carga paralela).
- `openspec archive` necesita `--yes` no interactivo; lock stale:
  `rm openspec/changes/archive/.openspec-archive.lock`.
- Screenshots a /tmp o rutas Windows: usar paths relativos al repo
  (los absolutos Windows en .mjs bajo Git Bash no aterrizan donde se
  espera).
