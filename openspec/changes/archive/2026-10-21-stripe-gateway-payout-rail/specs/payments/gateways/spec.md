# Delta: payments/gateways (stripe-gateway-payout-rail)

## ADDED Requirements

### Requirement: Adaptador Stripe para órdenes de un solo cargo

El sistema SHALL exponer `STRIPE` como provider del `GatewayRegistry`
cuando exista `STRIPE_SECRET_KEY`. `createOrder` SHALL crear una
Checkout Session `mode=payment` con `client_reference_id` y
`metadata.refId` = `refId` de la orden, `customer_email` = email del
comprador, `success_url`/`cancel_url` = `returnUrl`, y
`payment_method_types` = `card` + `link`; SHALL devolver `session.url`
como `paymentUrl` y persistir el `cs_…` id como `Payment.gatewayRef`.
El monto SHALL enviarse en minor units según la tabla zero-decimal de
Stripe (CLP, JPY, KRW, VND, XAF, XOF, MGA, BIF, DJF, GNF, KMF, PYG,
RWF, UGX): `amount` ×100 salvo monedas zero-decimal. El adaptador
SHALL aceptar cualquier moneda ISO-4217 (sin whitelist propia).
`Payment.gateway` SHALL persistir `STRIPE`.

#### Scenario: createOrder CLP (zero-decimal)

- **WHEN** se crea una orden STRIPE por CLP 5000
- **THEN** se POSTea `/v1/checkout/sessions` con
  `unit_amount=5000`, `currency=clp`, `client_reference_id=<refId>` y
  `payment_method_types[]=card` + `[]=link`, y la respuesta mapea
  `paymentUrl=session.url`, `gatewayRef=cs_…`

#### Scenario: createOrder USD

- **WHEN** se crea una orden STRIPE por USD 25
- **THEN** `unit_amount=2500` y `currency=usd`

#### Scenario: Checkout con Link

- **WHEN** la cuenta Stripe tiene Link habilitado
- **THEN** el Checkout Session muestra pago acelerado Link sin código
  adicional en la API

### Requirement: Webhook Stripe firmado con fetch-confirm

`POST /payments/webhook/STRIPE` SHALL rechazar todo webhook cuya firma
`Stripe-Signature` no verifique (HMAC-SHA256 de `t.rawBody` con
`STRIPE_WEBHOOK_SECRET`, tolerancia de reloj ≤5min) o cuando falte la
firma o el body crudo. Tras validar, SHALL confirmar por
`GET /v1/checkout/sessions/:id` antes de liquidar
(`payment_status:"paid"` → PAID; `status:"expired"` → FAILED; otro
estado → error para que Stripe reintente, semántica MP/Fintoc). La
confirmación PAID SHALL llevar `gatewayData` normalizado:
`fee` del `balance_transaction` del cargo, `amount` y `currency` en
unidad mayor, `media` (payment method usado, p.ej. `card`/`link`),
`transferDate` y `raw` de evidencia.

#### Scenario: firma válida + sesión pagada

- **WHEN** llega `checkout.session.completed` con firma válida
- **THEN** el sistema GETea la sesión, extrae `refId` del
  `client_reference_id`/`metadata` y liquida PAID con `gatewayData`
  (fee real, amount, currency, media, raw)

#### Scenario: firma inválida o ausente

- **WHEN** el header falta, no verifica, o el timestamp excede 5min
- **THEN** responde webhook inválido sin consultar ni liquidar

#### Scenario: evento no terminal

- **WHEN** el evento es válido pero la sesión no está pagada ni
  expirada
- **THEN** responde error para que Stripe reintente

### Requirement: Polling Stripe por gatewayRef

`GET /payments/:id` SHALL resolver `refreshStatus` consultando
`GET /v1/checkout/sessions/{Payment.gatewayRef}` para órdenes STRIPE
PENDING: `paid` → PAID con la misma `gatewayData` normalizada;
`expired` → FAILED; `open` → PENDING.

#### Scenario: sesión expirada en polling

- **WHEN** el comprador abandonó y la sesión consultada está `expired`
- **THEN** el polling liquida FAILED por el mismo settle del webhook

### Requirement: Routing de pasarela por moneda (fallback)

`PaymentGateway` SHALL poder declarar `currencies?: string[]`
(`undefined` = sin restricción). `GatewayRegistry` SHALL exponer
resolución por moneda: el provider pedido (param
`payments.default_gateway`) gana cuando soporta la moneda de la orden;
si no, se usa el primer adaptador registrado que la declare soportada;
si ninguno la declara, se conserva el default actual (que mantiene su
propio rechazo por moneda en `createOrder`). El routing por cuenta
propia del productor (`OWN_GATEWAY`) SHALL seguir ganando antes que
cualquier resolución por moneda.

#### Scenario: Orden USD con default FLOW

- **WHEN** el default es FLOW (CLP/MXN) y llega una orden en USD
  existiendo un adaptador STRIPE registrado
- **THEN** la orden se crea por STRIPE y `Payment.gateway="STRIPE"`

#### Scenario: Orden CLP inalterada

- **WHEN** el default es FLOW y llega una orden en CLP
- **THEN** la orden se crea por FLOW exactamente como hoy
