# Producer gateway accounts (pasarela propia del productor)

## Problema

El modelo de fees (`producer-fee-model`) ya contempla `feeMode
OWN_GATEWAY` — la venta se cobra en la cuenta Flow/MercadoPago **del
productor**, la plata va directo a él y la plataforma solo devenga su
comisión (`all-in − card%`, neteada en su payout como líneas
`OWN_METHOD_*`). Pero hoy no existe forma de registrar credenciales por
productor: todas las órdenes salen por las credenciales de la
plataforma (MANAGED). Las piezas `OWN_GATEWAY` del libro son dead code
sin el onboarding de cuentas.

## Propuesta

- **`ProducerGatewayAccount`**: credenciales del productor cifradas con
  AES-256-GCM (`PRODUCER_GATEWAY_KEY` env) — nunca en texto plano ni
  expuestas por API (solo `keyMask` últimos 4). Una cuenta ACTIVE por
  productor; registrar una nueva desactiva la anterior. Providers:
  `FLOW`, `MERCADOPAGO`, y `STUB` solo fuera de producción (ejercita el
  camino completo en dev/tests sin credenciales reales).
- **`GatewayAccountsService`**: fábrica de adaptadores por cuenta
  (decrypt → `FlowGateway`/`MercadoPagoGateway`/`StubGateway` con
  `confirmUrl` propia `…/webhook/<PROVIDER>?account=<id>`), cache por
  `accountId+updatedAt`. Escribe `gatewayAccountId` en
  `GatewayTransaction` y `lastError` de la cuenta cuando una llamada
  falla.
- **Checkout**: tickets y series-pass del productor con cuenta ACTIVE
  se cobran por su adaptador → `Payment.gatewayAccountId` + `feeMode
  OWN_GATEWAY` + desglose `ownMethodBreakdown(mode:"OWN_GATEWAY")`.
  Sin cuenta → MANAGED como hoy (fallback implícito: desactivar la
  cuenta devuelve el cobro a la plataforma).
- **Webhook**: `POST /payments/webhook/:provider?account=<id>`
  resuelve el adaptador por cuenta (el productor configura esa URL en
  su panel Flow/MP); el Payment encontrado por refId debe pertenecer a
  esa cuenta — mismatch → 400.
- **Polling** `GET /payments/:id`: `refreshStatus` contra el adaptador
  de `Payment.gatewayAccountId` cuando existe.
- **Endpoints productor** (`SessionGuard` + PRODUCER APPROVED o
  `admin.access`): `GET /producer/gateway-account` (masked + URL de
  webhook a configurar), `PUT /producer/gateway-account` (crea/rota),
  `DELETE /producer/gateway-account` (desactiva).
- **Front**: sección "Mi pasarela" en la página de parámetros del
  productor: estado de la cuenta, URL de webhook para configurar en
  Flow, formulario de alta y botón desactivar.

## Out of scope

- Cuentas de academia (ACADEMY sigue por la pasarela de la plataforma).
- Suscripciones por cuenta del productor (el motor de suscripciones es
  facturación de plataforma — siempre por `payments.subscription_gateway`).
- Refunds por pasarela propia (se gestionan en el panel del proveedor).
- `OWN_METHOD` (ventas manuales: efectivo/transferencia) — slice
  `producer-own-methods`.
