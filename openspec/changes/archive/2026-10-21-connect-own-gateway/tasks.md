# Tasks; connect-own-gateway

- [x] 1. `StripeGateway`: ctor opcional `stripeAccount` → header
  `Stripe-Account` en `call()` (createOrder/verifyWebhook/
  refreshStatus cubiertos por el mismo wrapper); spec del header.
- [x] 2. `gateway-accounts.service`: `SUPPORTED` + STRIPE;
  `AccountCredentials.accountId`; `upsert` STRIPE resuelve el
  `PayoutDestination` STRIPE_CONNECT ACTIVE del actor → `accountId`
  (sin destino → 400 guiando a conectar); `buildAdapter` instancia
  `StripeGateway(secretPlataforma, webhookSecret, baseUrl, onTx,
  stripeAccount)`; `keyMask` = últimos 4 del `acct_`.
- [x] 3. `producer-gateway.controller` (PUT): STRIPE no exige
  `apiKey`/`secret` del DTO; la `acct_` sale del destino; respuesta
  masked igual.
- [x] 4. Specs: upsert STRIPE con/sin destino, buildAdapter con
  Stripe-Account, polling por cuenta; `checkout.service.spec` caso
  OWN_GATEWAY STRIPE si no existe.
- [ ] 5. `docs/architecture.md` (fila cuenta propia STRIPE) +
  `docs/qa-flows-inventory.md`; openspec validate + suite + commit.
