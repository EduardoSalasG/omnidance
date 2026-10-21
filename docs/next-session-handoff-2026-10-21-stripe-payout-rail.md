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
