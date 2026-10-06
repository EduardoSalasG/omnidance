# Handoff - 2026-10-06c: gateway-port-normalization implementado

Sesión sobre `dev` tras `admin-finance-console` (commit `04a9e00`).
Slice 2/5 completado: puerto de pagos normalizado multi-proveedor.

## Implementado (slice: gateway-port-normalization)

**Infraestructura**

- `apps/api/src/payments/domain/gateway-registry.ts` (nuevo):
  `GatewayRegistry` indexa adaptadores por `name` (`get(provider)`,
  `default()`, `resolve(name|null)` con fallback al default). Token
  `PAYMENT_GATEWAYS` en `PaymentsModule` (`resolveGateways` factory):
  instancia Flow/stub por env (misma regla que `resolveGateway`
  anterior) + MercadoPago si existe `MERCADOPAGO_ACCESS_TOKEN`.
  `PAYMENT_GATEWAY` sigue exportándose = `registry.default()` (compat
  con subscriptions, que usan gateway único - slice siguiente).
- `apps/api/src/payments/infrastructure/mercadopago.gateway.ts`
  (nuevo): `PaymentGateway` completo - preference
  (`init_point`/`external_reference`/`notification_url` →
  `/api/payments/webhook/MERCADOPAGO`), webhook {type:"payment"} o IPN
  {topic:"payment"} → `GET /v1/payments/:id` → `approved`→PAID,
  `rejected`/`cancelled`/`refunded`/`charged_back`→FAILED, no-terminal
  lanza → 400 y MP reintenta. `refreshStatus` por
  `external_reference`. Auditoría `GatewayTransaction` con el mismo
  patrón `call()` que Flow (sanitize + finally always-records).
  Monedas: CLP/USD/EUR/MXN/ARS/BRL/COP/PEN/UYU (Flow sigue solo CLP).

**Confirmación normalizada**

- `webhook.controller.ts`: `POST /payments/webhook` (legacy →
  adaptador default - urlConfirmation de Flow sigue igual) +
  `POST /payments/webhook/:provider` (registry.get; no registrado →
  404). Ambos caen al privado `confirm(gateway, body)` →
  `verifyWebhook` → `recordWebhookReceived` → `settle` (idempotente).
- `PaymentSettlementService`: `gatewayData` normalizado gana
  `currency` (shape plana `{fee,amount,media,transferDate,currency}`
  - la misma que Flow produce desde paymentData); el settle cruza
  monto **y moneda** contra `Payment` → `AMOUNT_MISMATCH` con
  `expectedCurrency`/`reportedCurrency` en el payload + notify
  OPERATIONAL.
- Polling `GET /payments/:id`: resuelve el adaptador por
  `Payment.gateway` persistido (nunca el default); `FREE`/`MANUAL`
  fuera del registry → sin consulta activa.

**Checkout**

- `CheckoutService.resolveGateway()`: param `payments.default_gateway`
  (seed `"FLOW"`) resuelto contra el registry; provider sin
  credenciales cae al default del env (dev sin credenciales Flow →
  stub igual que antes). Todos los flujos (ticket, series-pass,
  membership, workshop, private) persisten `Payment.gateway =
  gateway.name` y pasan `currency: payment.currency` a `createOrder`.
- `ports.ts`: `createOrder` acepta `currency?`; resultados de
  `verifyWebhook`/`refreshStatus` documentan `gatewayData` normalizado
  con `amount`/`currency`.

**Params/seed/env**

- `payments.default_gateway` = `"FLOW"` en `PARAM_DEFAULTS` (String,
  editable por `PUT /admin/params/:key`).
- `.env.example` + `docs/ci-cd.md`: `MERCADOPAGO_ACCESS_TOKEN` /
  `MERCADOPAGO_BASE_URL` documentados (opcionales - sin token el
  adaptador no se registra).

## Verificación

- **1574/1574 tests API (72 archivos)** - incl. specs nuevos:
  `gateway-registry.spec` (6), `mercadopago.gateway.spec` (14), 7
  nuevos en `webhook.controller.spec` (legacy→default, :provider
  dispatch, 404 provider desconocido, firma inválida→400, refId sin
  pago→404, polling por Payment.gateway, MANUAL sin consulta),
  assert `currency` en createOrder del checkout, caso de cruce de
  moneda en `payment-settlement.service.spec`.
- API `tsc --noEmit` limpio (incl. specs vía nest watch - ojo:
  `npx tsc --noEmit` NO compila specs; el watch del `npm run dev` sí
  y fue el que cazó el tipo del mock).
- `openspec validate --changes`: 10/10.
- OpenAPI/Postman regenerados: **219 paths** (suma
  `/payments/webhook/{provider}`).
- `docs/architecture.md`: sección "Pasarela de pago (Flow)" →
  "(multi-proveedor)" con registry, webhooks, selección por orden,
  MP y fila `payments.default_gateway` en la tabla de params.

## Notas de operación

- La API dev quedó corriendo en :4000 pero el árbol de procesos quedó
  sucio (hubo un EADDRINUSE transitorio del watch - la instancia que
  sirve tiene el código nuevo, verificado vía docs-json). Si molesta:
  matar lo que escuche :4000 y `pnpm dev:api`.
- `subscriptions.service`/`platform-subscriptions.service` siguen
  inyectando `PAYMENT_GATEWAY` único (SubscriptionProvider Flow) -
  es el slice siguiente `subscription-port-generic`.
- MP en producción requiere configurar el webhook en el panel MP
  (`{API_URL}/api/payments/webhook/MERCADOPAGO`) y el param
  `payments.default_gateway="MERCADOPAGO"` solo donde aplique.

## Próximo slice

`subscription-port-generic` (3/5): puerto `SubscriptionProvider`
con tipos normalizados (sacar `Flow*` del contrato), Flow como
adaptador, y slot preparado para MP preapproval/Stripe - ver
`omni-dance.md` §"Arquitectura de pasarelas".

Luego: `producer-gateway-accounts` (4/5, `GatewayAccount` cifrado
AES-256-GCM) y `producer-own-methods` (5/5).
