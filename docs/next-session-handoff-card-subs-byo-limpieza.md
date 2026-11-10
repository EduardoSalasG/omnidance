# Handoff: academy-card-subs-byo IMPLEMENTADO + limpieza de pendientes

Sesión 2026-11-10 (tarde). Orquestación multi-agente: dos tracks en
paralelo. El slice CARD subs per-account que el change BYO dejó
interim quedó implementado, verificado y **archivado**. La limpieza
de pendientes del handoff anterior quedó completa.

## Resultado

- **`academy-card-subs-byo` implementado y archivado** (commit
  `0502a335`): `providerFor(sub)` resuelve cada llamada remota de
  `SubscriptionsService` (`gatewayAccountId` → adaptador de la cuenta,
  fail-closed; `null` → provider de plataforma legacy). Subs BYO nacen
  con `gatewayAccountId` sellado; customer/plan espejo namespaceteados
  (`gatewayCustomerIds["<GW>:<acc>"]`, `remoteRefs["<GW>:<acc>:<CUR>"]`).
  `customer-return`/`subscription-webhook` aceptan `?account=`;
  billing events rechazan mismatch cuenta↔sub. `reconcileAll`
  multi-cuenta, cancel tolerante a cuenta apagada, sweep por
  `GatewayAudit.gatewayAccountId`. Payments de alta/renovación BYO
  congelan take → statement. Subs legacy (null) sin migración.
- **Fix commits `90576d25`**: `@Type(() => Number)` en
  `RunsQueryDto.take` (bug `runs?take=N` → 400); fixtures gap-crm por
  mes civil America/Santiago; paridad i18n en/fr/pt-PT (198 keys
  traducidas + 4 extras muertas borradas, 4797 keys 0 drift);
  `gotoStable` para flake dancer-eventos mobile (Fast Refresh
  cancelaba `page.goto` en `next dev`).

## Verificación (evidencia)

- `pnpm --filter @omnidance/api test` = **135 archivos / 2550 tests
  verdes** (incluye los nuevos de ambos tracks); typecheck/build API,
  typecheck web, `openspec validate --changes` (3/3), i18n parity
  0 drift, `i18n-audit` ALL_KEYS_OK.
- gap-crm e2e: **35/35** contra Postgres+Redis vivos.
- dancer-eventos mobile: **4/4** contra stack limpio (dev :3001
  fresco + API :4000). Reproducido pre-fix (goto interrumpido por
  full reload), verde post-fix.
- openapi.json + postman regenerados contra API viva (382 paths,
  params `?account=` documentados).
- **Sin verificar**: smoke manual end-to-end de una sub BYO real
  (alta → registerUrl de SU cuenta → customer-return → ACTIVE →
  renovación con take → statement). La lógica está cubierta por specs
  pero no se ejerció contra Flow sandbox.

## Operativo

- API :4000 corre `node dist/main.js` desde el build nuevo (shell
  `1e6af6`); web dev limpio en **:3001** (shell `74044b`). El dev
  server :3000 quedó **zombie sirviendo 500** (PID 38676, .next
  corrupto por sesiones anteriores): matar y `pnpm dev:web` normal,
  o reusar :3001 con `QA_BASE_URL`.
- `.auth/` regenerado por el corrido de playwright.

## Decisiones y notas del implementador

- `flowSubscriptionId @unique` quedó global (sin migración): los IDs
  Flow salen de un namespace por comercio; colisión cross-account es
  teórica, documentada en design.
- El orphan sweep descubre cuentas por `subscription/create`
  auditados (no por enumerar ACTIVE): cubre también cuentas apagadas
  con huérfanas pendientes.
- `periodLabel` salió de `liquidaciones/page.tsx` a `format.ts` (error
  latente de typegen de Next al regenerar `.next`, no del change).

## Pendientes / gaps

- **`academy-byo-collections` sigue abierto** (tasks 2.4 = archive):
  su único bloqueo era este slice, ya implementado. El owner puede
  archivarlo cuando quiera (`openspec archive academy-byo-collections
  --yes`); su delta ya está aplicado en specs canónicas.
- Smoke manual subs BYO pendiente (ver arriba): alta por cuenta STUB
  o Flow sandbox + renovación → statement.
- multipais-foundation: tasks 10/11/13 siguen sin implementar (slices
  grandes de producto).
- Migración de subs legacy our-Flow → BYO: fuera de alcance por
  diseño, decisión operativa posterior.
