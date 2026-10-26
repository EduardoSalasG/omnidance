# Handoff — 2026-10-26 (multipaís currency + phone)

## Estado

`dev` = `bca7e362`. Working tree limpio. Dos changes implementados,
revisados (2 rondas: reviewer → fixer → verde) y archivados:
`multipais-currency` + `multipais-phone` = tasks 2 y 3 de
`multipais-foundation` (marcadas [x] en su tasks.md). Specs canónicas
mergeadas — `platform-multicountry` ahora es spec propia.

## Entregado

**multipais-currency** — cobro multi-moneda real, agnóstico de país:
- Schema: `Country.currency`, `MembershipPlan.currency`+`remoteRefs`,
  `MembershipSubscription.currency`, `PaymentClaim.currency`,
  `PlatformSubscription.countryCode`, `Person.gatewayCustomerIds`
  (mapa `{provider: customerId}`; `flowCustomerId` = espejo legacy FLOW).
- `chargeSpec` resuelve `TierPrice(tierCode,kind,cycle,country)` →
  fila CL → param `*_monthly_clp`; devuelve `{amount,currency}`.
- Provider de subs por moneda: CLP→param `subscription_gateway`,
  otra→primer `SubscriptionProvider` que la soporte; error explícito
  si ninguno. Espejos remotos por `"<GW>:<CUR>"` en `remoteRefs`
  (Stripe lookup_key `omni_<planId>_<cur>`); `flowPlanId` intacto.
- Promos `FIXED_CLP` solo aplican a cargos CLP; PERCENT a todo.
- Ticket de puerta hereda `event.currency`; orden WORKSHOP usa la
  moneda del país de la academia.
- Admin: `GET/POST/PUT /admin/tier-prices` + `/admin/facturacion/precios`
  (link desde facturacion). Front: `formatMoney(amountMinor, currency)`
  (divide por 10^fractionDigits resuelto); vistas billing/pro reciben
  `prices` del price book del país del actor.
- Migraciones aplicadas: `20261114_multipais_currency`,
  `20261116_person_gateway_customer_ids`. Seed: TierPrice CL para
  tiers academy+producer derivados de params (update:{} no pisa).

**multipais-phone** — normalización E.164 end-to-end:
- `normalizePhone(raw, defaultCountry)` + `normalizePhoneOrNull` en
  `@omnidance/shared` (libphonenumber-js 1.12.31); `phone`=E.164,
  `phoneCountryCode`=ISO-2 derivado; `+` overridea el default.
- Write paths: PATCH /me, POST /me/complete-profile, door-sale
  (default=país del venue), POST /leads, import CSV (país academia),
  convertLead/demo normalizan leads legacy.
- `PhoneInput` (selector | contexto): selector en perfil/datos,
  completar, bienvenida; contexto (sin selector, `+` override) en
  ProLeadForm. Door-sale no tiene UI staff aún (API lista).
- Migración `20261115_multipais_phone`: backfill CL + normalización
  dup-safe (intra-candidatos y contra filas ya `+`).

## Verificación

- vitest: payments+checkins 663, people/checkins/leads/academies 368,
  shared 20 — todo verde post-fixes.
- tsc api+web limpio; i18n-parity 0 missing/0 extra (4263 keys).
- `migrate diff` schema↔migrations vacío; `db:seed` corrido OK.
- `openspec validate` verde; ambos changes archivados con deltas
  mergeados; openapi.json + postman regenerados (349 paths);
  qa-flows-inventory y architecture actualizados.

## Pendientes / gaps honestos

- **E2e no corrido**: `gap-checkins.e2e` quedó con generadores válidos
  pero no se ejecutó (esperaba la migración de customer_ids — ya
  aplicada). Correr `pnpm test:e2e` con stack vivo.
- **Stripe webhook → membresías/platform subs**: no cableado (solo
  social-pass consume billing events). `customerReturn` adoption +
  polling de reconcile cubren el camino; paridad webhook = follow-up.
- **Academias fuera de CL no tienen onboarding de país todavía**:
  academy.city → currency resuelve, pero crear una academia en otro
  país requiere la fila TierPrice + gateway de ese mercado configurado.
- `PayoutRail` Fintoc sigue pendiente; tarifa Pase Social sin fijar.
- Web `next build` tiene error PRE-EXISTENTE ajeno a este cambio:
  `.next/types` rechaza export `promoState` en
  `admin/facturacion/promos/page.tsx` (commit 99830574) — typecheck
  limpio, pero el build de prod puede fallar; revisar antes del
  próximo release.
- Prisma client: el dev server en watch (PID node) pudo haber quedado
  con DLL stale tras `prisma generate` — si la API dev tira errores de
  columna, reiniciar `pnpm dev:api`.
- multipais-foundation sigue abierto: tasks 10 (packs), 11 (prácticas
  free), 13 (congresos).

## Notas técnicas de la sesión

- `pnpm add` re-resuelve links y dejó symlinks de vitest apuntando a un
  hash de peers viejo → `MODULE_NOT_FOUND`; `pnpm install` lo repara.
- `openspec archive` deja `.openspec-archive.lock` stale si corre dos
  veces seguidas en el mismo comando — borrar el lock y reintentar.
- Orquestación: 2 implementadores paralelos + 2 reviewers + 2 fixers.
  Puntos compartidos resueltos por el orquestador: schema.prisma
  (currency only), lockfile (dep pre-instalada), door-sale currency
  line, seeds `phoneCountryCode`, docs regeneradas, qa-inventory.
