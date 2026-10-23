# Handoff 2026-10-22/23 — fixes + i18n paridad + notify-register + desembolso-page + tiers COBROS

## Commiteado en `dev` (main quedó en bfb1ba80 = release 1.9.0 — nada pusheado desde entonces)

- `dca0f2cb` fix: preheader del mail OTP distinguía mal vigencias - código 10 min, link 15 min
- `7513aff4` feat: aviso `user.registered` a admins APPROVED en cada alta real (register/verify/otp); NotificationsModule @Global
- `6609a620` feat: `/productor/desembolso` página propia en Configuración; "Mis pagos" pasa al grupo de módulos; Stripe Account Link vuelve a la ruta nueva
- `1de463ed` feat: paridad i18n en/fr/pt-PT - 180 keys (parts nuevos cities/pase/trip + sueltas)
- `db9df99f` docs: qa-inventory + architecture + flows
- `bfb1ba80` chore: release 1.9.0 (pusheado a dev y main → deploy corrido)
- `859da84d` feat: **flags de línea de producto** `social_line`/`academy_line` (ON por default) — gatean tabs/sheet/sidebar del bailarín por lente; pensados para operar solo-academias o solo-nightlife al partir
- `988fbd19` + `6ee718bf` docs: plan económico §10 reescrito — reestructura de tiers (academia COBROS/STUDIO/PRO 39.990/79.990/119.990 por features; Producer Pro 79.990/169.990/299.990 por facturación), descuentos −8%/−15%, Pase Social + publicidad segmentada + Fintoc en proyección (captura ~$76M ARR), fila "Tracción estresada" ($27M), métricas Concentración top-1 y Expansión de tier. Razonamiento completo en `docs/estrategia-comercial-2026-10-22.md`
- `ec318cc6` feat: **academy-tier-cobros implementado** — `assertAcademyTier` (patrón producer-pro), matriz `TIER_FEATURES`, gates en ~10 módulos de consola, `GET /me/academy/entitlements`, `AcademyEntitlementsProvider` + `AcademyTierGate`/`AcademyTierPaywall` front, take ~4,8% (`ACADEMY_COBROS_TAKE`) en cobros de membresías de academias COBROS, migración `academy_tier_cobros` (enum + COBROS), subs existentes quedan STUDIO (no-degradación), STARTER queda legacy no-vendible
- `bae492e5` test+docs: **e2e setup acepta banner de consentimiento** (un LegalText nuevo activo cubría CTAs fixed-bottom y rompía 6 specs); openapi.json/postman regenerados; 2 changes archivados con deltas mergeados

## Verificación

- vitest módulos tocados: 949 tests verdes (incl. specs nuevos de gate por tier + take COBROS)
- tsc api + web limpios; i18n-parity missing 0 (4105 keys × 4 locales)
- **e2e Playwright: 14/14 verdes** (chromium + mobile) tras fix del banner
- openspec validate verde; `academy-tier-cobros` y `product-line-flags` archivados
- Review UI del paywall nuevo: patrón console consistente (Card + Badge + CTA), a11y ok (aria-hidden icon, role=status)

## Pendiente / gaps conocidos

- `/crm/*` y `/analitica` para actor academia recaen en 403 genérico del API (no en AcademyTierPaywall) — la nav los oculta; paywall dedicado = follow-up chico
- `/academia/alumnos`: bloque insights puede mostrar error inline en COBROS (fetch 403) — página base funciona
- Follow-up de product-line-flags: toggle de lente en /inicio visible aunque una línea esté OFF; secciones de landing marketing no gateadas
- Stack corre en dev (`pnpm dev:web` activo tras restart — `.next` estaba corrupto, ver AGENTS "dev server zombie")
- Tarifa de reembolso de crédito del Pase Social SIN FIJAR — bloquea precio público del pase
- Cotización de tarjeta de Fintoc pendiente (A2A ~1,35% confirmado público)
- Tasks multipaís sin tocar: 10 (packs), 11 (prácticas free), 13 (congresos)

## Notas técnicas de la sesión

- `openspec archive` necesita `-y` y headers `## Why`/`## What Changes` en inglés; lock stale en `changes/archive/.openspec-archive.lock` si corre doble — borrar y reintentar.
- AuthController: 5º param opcional `@Optional() notifications?` — specs que lo instancian a mano siguen funcionando.
- Git en shells MSYS: `export PATH="/c/Program Files/Git/bin:$PATH"`.
- **e2e + LegalText**: si el seed activa una versión nueva de términos, los specs mueren por banner de consentimiento — `auth.setup.ts` ya lo acepta post-login.
