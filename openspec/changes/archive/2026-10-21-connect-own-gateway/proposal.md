# Change: connect-own-gateway

## Por qué

El rail Connect de desembolso existe (`PayoutDestination` + onboarding
Express reutilizable) pero el productor internacional sigue cobrando
por la pasarela de la plataforma (MANAGED). Para completar
own-gateway multipaís falta que `ProducerGatewayAccount` acepte
`STRIPE` y que el checkout cobre directo en la `acct_` del productor
(direct charges con `Stripe-Account` header) — la plata llega a él
sin tocar la cuenta de plataforma, y la comisión se devenga/netea
como OWN_GATEWAY igual que Flow/MP/Fintoc.

## Qué cambia

- `ProducerGatewayAccount` acepta provider `STRIPE`: sus
  credenciales no son un secret del productor sino el `accountId`
  (`acct_…`) de una Connect account ya onboarded — el alta referencia
  un `PayoutDestination` ACTIVE del actor (mismo onboarding, una sola
  cuenta cubre cobro y desembolso). `secret`/webhook secret no aplica
  (confirmación por polling `refreshStatus` + `Stripe-Account`
  header; el webhook de cuentas Connect queda para iteración).
- `GatewayAccountsService.buildAdapter` instancia `StripeGateway`
  con `stripeAccount=accountId`: `createOrder` crea la Checkout
  Session **en la cuenta conectada** (header `Stripe-Account`), la
  plata cae directo al productor; `refreshStatus` consulta la sesión
  con el mismo header. `feeMode`/`OWN_GATEWAY` y el desglose de
  comisión no cambian.
- Alta desde `/producer/gateway-account`: para STRIPE el PUT recibe
  solo el provider — el backend resuelve la `acct_` del destino
  ACTIVE del actor (sin destino → 400 guiando a conectar primero en
  `/productor/pagos`).
- `GET /api/producer/gateway-account` expone `keyMask` como últimos
  4 del `acct_` (`••••xy34`) igual que los otros providers.

## Fuera de scope

- Webhook de cuentas conectadas (Connect webhook `account.updated` /
  `checkout.session.*` con `event.account`): v1 confirma por polling
  `refreshStatus` como en dev/sandbox — suficiente porque el flujo
  de compra siempre vuelve por `return_url` y el polling cubre.
- `application_fee_amount` en el cargo (el modelo actual devenga la
  comisión y la netea en el payout — no se cobra en el cargo).
- Onboarding Connect separado para cobro (se reutiliza el destino).
