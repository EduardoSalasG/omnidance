# Tasks - producer-gateway-accounts

- [x] Schema + migración `producer_gateway_accounts`:
  `ProducerGatewayAccount` (producerId, provider, credentialsEnc,
  keyMask, status, lastError, verifiedAt?) + `Payment.gatewayAccountId`
  + `GatewayTransaction.gatewayAccountId`.
- [x] `common/secrets.ts`: AES-256-GCM encrypt/decrypt con
  `PRODUCER_GATEWAY_KEY` (64-hex) + mask last4. Spec de roundtrip.
- [x] `GatewayAccountsService`: list/upsert/disable por productor
  (una ACTIVE - upsert desactiva la anterior), `adapterFor` con cache
  por id+updatedAt, `activeForProducer`. GatewayTxEntry gana
  `gatewayAccountId`; el writer estampa `lastError` en fallos.
- [x] Checkout: `purchaseTicket` + `purchaseSeriesPass` resuelven la
  cuenta ACTIVE del productor → adapter propio + `OWN_GATEWAY` +
  `gatewayAccountId`; sin cuenta → comportamiento actual.
- [x] Webhook `?account=<id>` + validación cuenta↔provider↔payment;
  polling `GET /payments/:id` por cuenta.
- [x] Endpoints `/producer/gateway-account` (GET/PUT/DELETE) con
  guard productor/admin y respuesta masked + webhookUrl.
- [x] Front: sección "Mi pasarela" en params del productor + i18n.
- [x] Specs: service (encrypt, upsert, adapterFor), checkout
  (OWN_GATEWAY routing), webhook (account param + mismatch),
  controller (self-scope + sin fuga de secretos).
- [x] `.env.example` + `docs/ci-cd.md` (PRODUCER_GATEWAY_KEY) +
  `docs/architecture.md` + tasks.md + openspec validate + suite
  completa + commit dev.
