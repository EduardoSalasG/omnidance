# Handoff 2026-10-22 — fixes + i18n paridad + notify-register + desembolso-page

## Commiteado en `dev` (5 commits, main quedó en c7732c86 — nada pusheado)

- `dca0f2cb` fix: preheader de los mails magic-link/verify decía "válido
  15 minutos" para el código OTP — el código dura 10 min (`OTP_TTL_MS`)
  y el link 15 (default `createMagicToken`). Ahora "código X (10 min)
  o link (15 min)".
- `7513aff4` feat: **aviso a admins de registro nuevo**. `AuthController.
  notifyAdminsNewUser` → `notifySafe` OPERATIONAL `user.registered` a
  cada `personRole{ADMIN,APPROVED}` cuando nace la Person por
  register / GET verify / POST otp-verify con `!existed`. Claim y altas
  admin (import/staff/demo/reactivate) NO notifican. `NotificationsModule`
  ahora `@Global` (patrón JobsModule) — AuthController lo inyecta
  `@Optional` para no romper specs que lo arman a mano.
  `AuthRepo.approvedAdminIds()` nuevo. Spec: 2 tests nuevos en
  auth.controller.spec (19 verdes).
- `6609a620` feat: **/productor/desembolso** página propia en el grupo
  Configuración del nav (ícono `bank` nuevo en ICONS). `/productor/pagos`
  queda solo listado de liquidaciones y su ítem "Mis pagos" pasó del
  grupo Configuración al grupo de módulos (tras Comprobantes). Stripe
  Account Link `return_url`/`refresh_url` ahora → `/productor/desembolso`
  (service + specs actualizados).
- `1de463ed` feat: **paridad i18n** — 180 keys faltantes traducidas a
  en/fr/pt-PT: parts nuevos cities.json/pase.json/trip.json por locale +
  keys sueltas en navExtra/consumer/admin/profile/legal/producer +
  catalogs/*.ts cableados (DM chain extendida). `i18n-parity`:
  missing 0 en los 3 locales.
- `db9df99f` docs: qa-inventory (§1 login aviso admin, §5 desembolso/
  pagos, §9 admin return_url), architecture.md (notifications @Global +
  wiring `user.registered` + Account Link URL), flows.md (diagrama
  magic link corregido: upsert ocurre en verify, +nota user.registered).

## Verificación

- vitest `src/auth src/payments`: **613 tests, 28 archivos verdes**
  (incluye specs ajustados a /productor/desembolso).
- `tsc --noEmit` api + web limpios. i18n-audit `ALL_KEYS_OK`;
  i18n-parity missing 0.
- openspec validate verde; changes archivados con deltas mergeados:
  `2026-10-22-admin-notify-on-register` → `specs/notifications/admin-alerts`
  (nueva), `2026-10-22-productor-desembolso-page` → `producer-pro`
  (1 modified + 1 added).
- e2e playwright: revisado — `e2e/smoke.spec.ts` no referencia pagos ni
  desembolso; nada que corregir.
- eslint en archivos tocados: 0 errores (1 warning preexistente `type Me`
  unused en BottomNav.tsx:37, no introducido acá).

## Pendiente / no verificado

- `impeccable detect` sobre el diff de UI quedó pendiente (superficie
  nueva mínima: página que solo monta la sección ya existente).
- Stack sigue corriendo (`pnpm dev`, api :4000 web :3000, docker up).
- Sin STRIPE_SECRET_KEY el flujo Connect muestra el estado 503
  diseñado — onboarding end-to-end no verificable local.
- Notificación admin: sin UI de "ver todos los registros" — el aviso
  llega al centro de notificaciones + push del admin (tour/badge
  existentes).
- Tasks multipaís sin tocar: 10 (packs), 11 (prácticas free), 13
  (congresos) + parciales de currency (2) y phoneCountryCode (3).

## Notas técnicas de la sesión

- `openspec archive` pide confirmación interactiva → usar `-y`; propone
  date-prefixed names (`2026-10-22-*`). Si dos archives corren seguidos
  deja `.openspec-archive.lock` stale en changes/archive/ — borrarlo y
  re-correr. Los headers del proposal deben ser `## Why` / `## What
  Changes` (inglés) o el archive falla.
- Constructor de AuthController ganó 5º param opcional
  (`@Optional() notifications?`) — los specs que lo instancian a mano
  sin él siguen funcionando.
- Git en estas shells MSYS: `export PATH="/c/Program Files/Git/bin:$PATH"`.
