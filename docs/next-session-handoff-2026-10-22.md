# Handoff 2026-10-22/23; fixes + i18n paridad + notify-register + desembolso-page + tiers COBROS

## Commiteado en `dev` (main quedó en bfb1ba80 = release 1.9.0; nada pusheado desde entonces)

- `dca0f2cb` fix: preheader del mail OTP distinguía mal vigencias - código 10 min, link 15 min
- `7513aff4` feat: aviso `user.registered` a admins APPROVED en cada alta real (register/verify/otp); NotificationsModule @Global
- `6609a620` feat: `/productor/desembolso` página propia en Configuración; "Mis pagos" pasa al grupo de módulos; Stripe Account Link vuelve a la ruta nueva
- `1de463ed` feat: paridad i18n en/fr/pt-PT - 180 keys (parts nuevos cities/pase/trip + sueltas)
- `db9df99f` docs: qa-inventory + architecture + flows
- `bfb1ba80` chore: release 1.9.0 (pusheado a dev y main → deploy corrido)
- `859da84d` feat: **flags de línea de producto** `social_line`/`academy_line` (ON por default); gatean tabs/sheet/sidebar del bailarín por lente; pensados para operar solo-academias o solo-nightlife al partir
- `988fbd19` + `6ee718bf` docs: plan económico §10 reescrito; reestructura de tiers (academia COBROS/STUDIO/PRO 39.990/79.990/119.990 por features; Producer Pro 79.990/169.990/299.990 por facturación), descuentos −8%/−15%, Pase Social + publicidad segmentada + Fintoc en proyección (captura ~$76M ARR), fila "Tracción estresada" ($27M), métricas Concentración top-1 y Expansión de tier. Razonamiento completo en `docs/estrategia-comercial-2026-10-22.md`
- `ec318cc6` feat: **academy-tier-cobros implementado**; `assertAcademyTier` (patrón producer-pro), matriz `TIER_FEATURES`, gates en ~10 módulos de consola, `GET /me/academy/entitlements`, `AcademyEntitlementsProvider` + `AcademyTierGate`/`AcademyTierPaywall` front, take ~4,8% (`ACADEMY_COBROS_TAKE`) en cobros de membresías de academias COBROS, migración `academy_tier_cobros` (enum + COBROS), subs existentes quedan STUDIO (no-degradación), STARTER queda legacy no-vendible
- `bae492e5` test+docs: **e2e setup acepta banner de consentimiento** (un LegalText nuevo activo cubría CTAs fixed-bottom y rompía 6 specs); openapi.json/postman regenerados; 2 changes archivados con deltas mergeados

## Verificación

- vitest módulos tocados: 949 tests verdes (incl. specs nuevos de gate por tier + take COBROS)
- tsc api + web limpios; i18n-parity missing 0 (4105 keys × 4 locales)
- **e2e Playwright: 14/14 verdes** (chromium + mobile) tras fix del banner
- openspec validate verde; `academy-tier-cobros` y `product-line-flags` archivados
- Review UI del paywall nuevo: patrón console consistente (Card + Badge + CTA), a11y ok (aria-hidden icon, role=status)

## Pendiente / gaps conocidos

- `/crm/*` y `/analitica` para actor academia recaen en 403 genérico del API (no en AcademyTierPaywall); la nav los oculta; paywall dedicado = follow-up chico
- `/academia/alumnos`: bloque insights puede mostrar error inline en COBROS (fetch 403); página base funciona
- Follow-up de product-line-flags: toggle de lente en /inicio visible aunque una línea esté OFF; secciones de landing marketing no gateadas
- Stack corre en dev (`pnpm dev:web` activo tras restart; `.next` estaba corrupto, ver AGENTS "dev server zombie")
- Tarifa de reembolso de crédito del Pase Social SIN FIJAR; bloquea precio público del pase
- Cotización de tarjeta de Fintoc pendiente (A2A ~1,35% confirmado público)
- Tasks multipaís sin tocar: 10 (packs), 11 (prácticas free), 13 (congresos)

## Notas técnicas de la sesión

- `openspec archive` necesita `-y` y headers `## Why`/`## What Changes` en inglés; lock stale en `changes/archive/.openspec-archive.lock` si corre doble; borrar y reintentar.
- AuthController: 5º param opcional `@Optional() notifications?`; specs que lo instancian a mano siguen funcionando.
- Git en shells MSYS: `export PATH="/c/Program Files/Git/bin:$PATH"`.
- **e2e + LegalText**: si el seed activa una versión nueva de términos, los specs mueren por banner de consentimiento; `auth.setup.ts` ya lo acepta post-login.

## Addendum 23-oct: unified-actor-entitlements (commit 00ed668a)

- `pro.required` eliminado de todo el codebase → contrato único `tier.required` + `{requiredTier, feature}`.
- API: `payments/domain/actor-entitlements.ts` (port + PRODUCER_FEATURES + adapters Producer/Academy), `common/actor-entitlements.ts` (`assertActorFeature` + resolvers), borrados `producer-pro.ts`/`academy-tier.ts`; ~15 call sites migrados con feature por endpoint (exports/multiStaff/analytics/crm); `GET /me/entitlements` nuevo (reemplaza fuente del front; `/me/academy/entitlements` delega DEPRECADO, `effectivePro` sigue en /me por compat).
- Web: `lib/entitlements-context.tsx` (EntitlementsProvider + useActorEntitlements), `components/tier-paywall.tsx` único (CTA por actor), borrados academy-entitlements-context/pro-paywall/isProRequired/effectivePro del front; crm-context `blocked` único; analítica fases colapsadas; namespace i18n `tierGate` (bug corregido: parts academyTier nunca se habían importado a catalogs).
- Fixtures e2e regularizados: academias de gap-*.e2e/academies.e2e ahora `tier:"PRO"` + mock `academy.findUnique` en finance.controller.spec → los 16 fallos "ambientales" quedaron en 189/189 verde.
- Verificado: tsc api+web limpio, vitest scope 93/93 + 189/189 e2e-fixture, i18n-parity 0 (4110 keys), openspec validate + archive `2026-10-23-unified-actor-entitlements` (deltas mergeados a producer-pro y analytics/query-console), openapi.json/postman regenerados.
- Pendiente: `pnpm db:seed` para los params nuevos; e2e smoke re-run tras el refactor de providers (último run pre-refactor fue 14/14); Producer Pro tiers nivelados (Pro/Growth/Scale) siguen mapeando a PRO hasta su change propio.

## Addendum 2 (23-oct): verificación post-refactor

- `pnpm db:seed` corrido OK (params de tiers + flags ya en DB local).
- **Dev server web zombie otra vez** (PID escuchaba :3000 sin responder → logins e2e timeouts 1.6m): fix documentado = taskkill + rm -rf .next + restart. Síntoma clásico AGENTS.
- E2e re-run post-refactor de providers quedó corriendo al cierre de contexto; verificar su resultado antes de pushear (el commit unificado `00ed668a` toca BottomNav/providers/layout).

## Addendum 3 (23-oct): REGRESIÓN PENDIENTE post-refactor

- `pnpm db:seed` OK.
- **REGRESIÓN front**: e2e post-unificación falla en los 6 logins; `/login` renderiza "Internal Server Error" (16s timeout, no 1.6m → no es throttle ni zombie, es compile/runtime). Commits involucrados: `00ed668a` (web agent borró `academy-entitlements-context.tsx`, `pro-paywall.tsx`, `academyTier.json`×4).
- **Hipótesis más probable**: algún import vivo a módulo borrado; revisar: `grep -rn "academy-entitlements-context\|pro-paywall\|academyTier" apps/web/src` (pro-section.tsx usa `ProView.effectivePro` = tipo API, ESO ESTÁ BIEN, no es el bug) y `apps/web/src/i18n/catalogs/*.ts`; si algún catalog aún importa `academyTier.json` (borrado) webpack rompe TODO → 500 en cada página. Fix: apuntar imports a `tierGate.json` (existe) o re-crear el part faltante, `rm -rf apps/web/.next`, restart `pnpm dev:web`, `pnpm test:e2e` hasta 14/14.
- Verificación rápida manual: `curl localhost:3000/es-CL/login` debe dar 308/200, no 500.
- Stack actual: api :4000 OK, web :3000 corriendo (pnpm dev:web shell 827979), docker db/redis up.
- Estado git: todo commiteado en `dev` hasta `f5fd4c69`. NO pushear hasta e2e verde.

## Addendum 4 (23-oct): regresión resuelta; e2e 14/14 verde

- **Causa real del 500**: NO era código; era `.next/prerender-manifest.json` corrupto (JSON válido + basura extra en pos 1455), patrón zombie documentado en AGENTS: procesos `next dev`/`node` huérfanos (~1GB c/u) escribían `.next` en paralelo. Fix: `taskkill` de TODOS los node dev orphen (no solo el del puerto), `rm -rf apps/web/.next`, restart. Se corrompió 2 veces hasta matar al huérfano real.
- **La API murió 2 veces bajo carga** (ERR_PNPM exit 1, probable OOM con ~8 procesos node pesados) → proxy 500 → timeouts de login engañosos. Diagnóstico rápido: `curl localhost:4000/api/features` antes de culpar al código.
- **Veredicto final e2e**: 14/14 verde (chromium+mobile) con stack sano y rutas compiladas. El refactor `unified-actor-entitlements` NO introdujo regresión funcional.
- `pnpm db:seed` corrido OK.
- Lección: ante 500s masivos en dev → verificar manifest `.next` con `node -e JSON.parse`, contar procesos node (~1GB = dev servers), y validar API antes de e2e.
