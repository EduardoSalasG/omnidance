# Tasks - stripe-gateway-payout-rail

- [x] 1. Puerto + registry: `currencies?` en `PaymentGateway`;
  `GatewayRegistry.resolve(name?, currency?)` con fallback por moneda;
  declaraciones FLOW/FINTOC; `CheckoutService.resolveGateway` pasa
  `Payment.currency`… — spec de registry actualizado.
- [x] 2. `StripeGateway` + spec: `createOrder` (Checkout Session,
  refId en `client_reference_id`+`metadata`, `card`+`link`, minor
  units por tabla zero-decimal), `verifyWebhook` (firma
  `Stripe-Signature` `t.rawBody` con tolerancia, fetch-confirm,
  PAID/FAILED + `gatewayData` con fee de `balance_transaction`),
  `refreshStatus` por `gatewayRef`. Wrapper `call()` con auditoría
  `GatewayTransaction` igual que MP.
- [x] 3. Wiring env: `resolveGateways` registra Stripe con
  `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET`/`STRIPE_BASE_URL`;
  `.env.example`.
- [x] 4. Schema: `PayoutDestination` + `Payout.rail`/`railRef` —
  migración versionada (solo orquestador).
- [x] 5. `PayoutRail` port + `ManualPayoutRail` +
  `StripeConnectPayoutRail` (`POST /v1/transfers`,
  `Idempotency-Key: payout:<id>`, minor units, `metadata.payoutId`) +
  resolver destino→rail.
- [x] 6. Endpoints actor: `POST/GET /me/payout-destinations`
  (Express account + Account Link; ownership regla `/me/payouts`;
  refresh `details_submitted`+`charges_enabled`→ACTIVE; 503 sin
  Stripe) + specs.
- [x] 7. `POST /admin/payouts/:id/disburse`: rail resolve → transfer →
  `PAID`+`railRef`+audit `PAYOUT_DISBURSE`; 409 manual/ya-pagado;
  fallo deja APPROVED + specs.
- [x] 8. Docs: `architecture.md` (fila payouts rail + Stripe),
  `docs/flows.md` si el diagrama de payout cambia, openapi/postman
  regen, `docs/qa-flows-inventory.md` (flujo desembolso + onboarding),
  openspec validate + suite + commit en `dev`.
