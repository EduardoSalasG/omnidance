# Tasks - gateway-port-normalization

- [x] `domain/ports.ts`: `createOrder` recibe `currency`; resultado de
  `verifyWebhook`/`refreshStatus` gana `amount`/`currency` opcionales.
- [x] `GatewayRegistry` + token `PAYMENT_GATEWAYS` en el módulo:
  registra adaptadores instanciados por env (FLOW/STUB/MP); expone
  `get(provider)` y `default()`; compat con consumers que inyectan
  `PAYMENT_GATEWAY` (el default sigue exportándose con ese token).
- [x] `webhook.controller.ts`: `POST /payments/webhook/:provider` con
  dispatch por registry; `/payments/webhook` legacy → default.
- [x] `flow.gateway.ts`: `currency` del param en `payment/create`
  (default CLP); `verifyWebhook`/`refreshStatus` exponen
  `amount`/`currency` del paymentData.
- [x] `checkout.service.ts`: resuelve provider por param
  `payments.default_gateway` (fallback al único/default del
  registry) y persiste `Payment.gateway`; pasa `currency`.
- [x] `mercadopago.gateway.ts` (nuevo): `PaymentGateway` completo
  (preference init_point / external_reference / webhook payment →
  `GET /v1/payments/:id` → approved=rejected mapping + gatewayData
  monetaria / refreshStatus por external_reference); auditoría
  `GatewayTransaction` igual que Flow.
- [x] `payment-settlement.service.ts`: cruza `amount`/`currency`
  normalizados contra el Payment (reusa el check de
  `gatewayReportedAmount`/`AMOUNT_MISMATCH` existente).
- [x] Params: seed `payments.default_gateway` (FLOW prod / STUB dev);
  doc en architecture.md tabla de params.
- [x] Specs: registry, webhook dispatch (404 provider desconocido,
  legacy→default), MP adapter (create/webhook PAID/FAILED/refresh),
  currency passthrough + moneda no soportada.
- [x] Docs: `architecture.md` (registry + webhook :provider + MP +
  envs), `docs/ci-cd.md` (env MERCADOPAGO_*), openapi/postman regen,
  handoff; commit en `dev`.
