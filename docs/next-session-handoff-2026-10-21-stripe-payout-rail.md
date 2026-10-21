# Handoff 2026-10-21b — stripe-gateway-payout-rail (en dev, sin deployar)

## Qué quedó en `dev` (3 commits, acumulando con multipaís)

- `622f38e` adaptador **STRIPE** del port PaymentGateway + routing por
  moneda. Implementador A. `createOrder`=Checkout Session
  (client_reference_id+metadata.refId, card+**Link**, minor units por
  tabla zero-decimal completa 16 monedas), webhook `Stripe-Signature`
  HMAC `t.rawBody` (multi-v1, tolerancia 5min) + fetch-confirm con
  expand hasta balance_transaction (fee real en gatewayData),
  `refreshStatus` por `cs_…` gatewayRef. `PaymentGateway.currencies?`
  declarada (FLOW=CLP, FINTOC=CLP/MXN, MP=lista, STRIPE/STUB=sin
  restricción); `GatewayRegistry.resolve(name,currency)` hace fallback
  por moneda — orden USD/EUR con default FLOW sale por STRIPE cuando
  está registrado; own-gateway sigue ganando primero. `Payment.currency`
  de tickets ahora se persiste desde `Event.currency` (antes siempre
  default CLP); otros flujos (membresía/workshop/private/series) pasan
  "CLP" porque sus entidades no declaran moneda.
- `c201598` port **PayoutRail** + destinos Connect + desembolso.
  Implementador B. `PayoutRail{disburse}` con `ManualPayoutRail`
  (lanza `PAYOUT_REQUIRES_MANUAL`) y `StripeConnectPayoutRail`
  (`POST /v1/transfers`, `Idempotency-Key: payout:<id>`). Modelo
  `PayoutDestination` (actorType+actorId+rail único, externalId=acct_,
  PENDING→ACTIVE por refresh-on-read `details_submitted`+`charges_enabled`).
  `POST/GET /me/payout-destinations` (crm.manage, ownership regla
  /me/payouts, Express + Account Link → `/productor/pagos`).
  `POST /admin/payouts/:id/disburse` solo desde APPROVED.
- Commit orquestador: schema (`PayoutDestination`, `Payout.rail`,
  `railRef`, `currency`) + 2 migraciones + **hardening post-review**:
  claim atómico `updateMany(status:"APPROVED")` tras el transfer
  (carrera con /pay → `PAYOUT_DISBURSE_CONFLICT` para conciliación),
  `Settlement.currency` = moneda única del devengado poblada en
  `Payout.currency`, país guardado al reusar destino PENDING,
  persistir destino ANTES del Account Link (sin acct_ huérfanas),
  lastError stale limpiado, labels pvt_/wks_ en Stripe checkout,
  docs sync (architecture/openapi/postman/qa-inventory).

## Verificación

- `openspec validate --changes` verde; change **archivado**
  (`2026-10-21-stripe-gateway-payout-rail`, deltas mergeados a
  `specs/payments/gateways` + `specs/payouts/payout-rails`).
- `tsc --noEmit` limpio; `vitest run src/payments` **25 archivos /
  538 tests verdes** (stripe.gateway 19, stripe-connect.rail 9,
  payout-destination.service 17, payouts.controller +7 disburse/conflict).
- Review subagente: **APPROVE** — spec fiel, fail-closed real,
  idempotencia correcta.
- openapi/postman regenerados contra API viva (323 paths).

## DB local — drift corregido

La DB dev estaba db:push-eada por encima de `_prisma_migrations`. Se
marcaron applied: person_soft_delete, series_reviews (ya reflejadas);
normalize_legacy_photourl aplicó vía deploy; los backfills de
multipais_foundation + city_denorm se corrieron a mano (City/Country
'city-stgo-cl' insertada, 7 venues/66 events/25 academies
backfilleadas) y se marcaron applied; admin_region/tier_price/
payout_rail_destinations/payout_currency aplicaron vía deploy.
`migrate status`: 56/56 aplicadas, up to date.

## Gaps conocidos (para próximo change o handoff)

- **Tickets/notifications hardcodean CLP**: el settle crea Ticket sin
  currency y formatea montos "CLP" en payment-settlement.service.ts
  (~6 sitios). Una orden USD real produce tickets/mails CLP — es del
  scope multipaís, este change lo hace observable.
- **Orden de fallback**: MP gana USD/EUR antes que STRIPE (registrado
  antes en resolveGateways) — deliberado? spec dice "primer adaptador
  que la declare". Si Stripe debe ganar no-CLP, reordenar registro.
- **`ProducerGatewayAccount` no acepta STRIPE**: cobro a cuenta
  Connect propia (direct/destination charges) = change siguiente —
  el onboarding de destino ya existe como prerrequisito.
- Sin test e2e `event.currency:"USD"`→STRIPE en checkout.service.spec
  (el routing se prueba a nivel registry).
- Stripe webhook endpoint: suscribir SOLO `checkout.session.completed`
  + `checkout.session.expired` en el dashboard al configurar.
- Front de `payout-destinations` no existe (API-first) — el onboarding
  aterriza en `/productor/pagos` que sí existe.
- Env nuevas: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
  `STRIPE_BASE_URL` (ya en .env.example).

## Próximos pasos (roadmap multipais-foundation)

1. Cobro own-gateway sobre Connect (productor cobra en su Stripe).
2. Consent por jurisdicción (task 6).
3. Discovery viajero: "cerca de mí" en front + city guides (7-8).
4. Pase Social (task 12) — necesitará SubscriptionProvider sobre
   Stripe Billing (slot ya previsto en el port).
5. Congresos (task 13).

## Notas técnicas

- `prisma migrate dev` no corre non-interactive en Windows → patrón
  `migrate diff` + carpeta manual + `migrate deploy` (o resolve
  --applied para drift). `npx` sigue frágil — spawn directo:
  `node ../../node_modules/.pnpm/prisma@5.22.0/node_modules/prisma/build/index.js`.
- Git no está en PATH en estas shells MSYS: `"/c/Program Files/Git/bin/git.exe"`.

## Addendum — gaps resueltos (commit f740cfc)

- `Ticket.currency` + formato de montos en notificaciones del settle
  ahora propagan `payment.currency` (era "CLP" hardcodeado, ~6 sitios).
- MP declara solo LatAm en el routing (`USD`/`EUR` las toma STRIPE);
  `createOrder` sigue aceptando todo vía SUPPORTED_CURRENCIES (cuentas
  propias intactas).
- Test e2e `event.currency:"USD"`→STRIPE agregado (checkout.spec 113).
- `.env.example`: nota suscribir solo `checkout.session.completed|expired`.
- vitest payments 180 tests de los archivos tocados verdes; tsc limpio.
- Quedan por diseño (slice propio): cobro own-gateway sobre Connect,
  front de payout-destinations, consent por jurisdicción (task 6).

## Addendum 2 — 3 slices más completados (2026-10-21)

Commits en `dev`: `c213bac2` consent, `5e718da6` front payouts,
`ed5b6344` connect-own-gateway, `6756aedb` schema consent, integración
docs/archivos. Changes archivados: `2026-10-21-consent-por-jurisdiccion`,
`2026-10-21-payout-destinations-front`, `2026-10-21-connect-own-gateway`
(deltas mergeados a specs canónicas; validate 4/4 verde).

- **consent-por-jurisdiccion**: `Person.jurisdiction` (country ISO-2
  register → EU/EEA+GB=`EU`, else=`CL`, editable en /perfil/datos);
  `LegalText` versionado por jurisdicción (seed cl-v1.0 + eu-v1.0
  `draftNote:"pending legal review"` — correr `pnpm db:seed`, sin
  seed falla abierto a CONSENT_VERSION legacy); `GET /legal/consent`
  público; `ConsentRecord` auditable por aceptación; front con
  checkboxes granulares GDPR (essential requerido + marketing/
  analytics opt-in) en registro y ConsentBanner.
- **payout-destinations-front**: sección "Cuenta de desembolso" en
  `/productor/pagos` — onboarding Connect Express end-to-end desde
  UI (país ISO-2 → POST → Account Link); estados Skeleton/empty/
  503-unavailable; PENDING muestra "Continuar en Stripe".
- **connect-own-gateway**: `ProducerGatewayAccount` acepta `STRIPE`
  (creds={accountId} del PayoutDestination ACTIVE — una sola cuenta
  Connect sirve cobro y desembolso); `StripeGateway` gana header
  `Stripe-Account` → direct charges; `feeMode:OWN_GATEWAY` intacto;
  confirmación por polling (Connect webhook = iteración posterior).

## Verificación final

- tsc api+web limpio; vitest `src/payments` 548 tests + legal/auth/
  people 68 tests verdes; eslint 0 issues nuevos; i18n-audit OK;
  `impeccable detect` [] en la UI nueva; openapi/postman 324 paths.
- DB dev: 57/57 migraciones aplicadas.

## Pendiente

- `pnpm db:seed` en cada entorno para poblar `LegalText` (sin él el
  /legal/consent responde el baseline legacy — fail-open, no 500).
- Texto EU GDPR `eu-v1.0` es contenido base — revisión legal antes
  de operar en Europa.
- Connect webhook de cuentas (confirmación webhook real de own-
  gateway STRIPE) — v1 confirma por polling.
- Roadmap: tasks 7-9 multipaís (landing por ciudad, geohash "cerca
  de mí", city guides) + Pase Social (task 12, Stripe Billing).
