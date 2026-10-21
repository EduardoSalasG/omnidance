# payments/gateways Specification

## Purpose
TBD - created by archiving change gateway-port-normalization. Update Purpose after archive.

## Requirements

### Requirement: Registro multi-proveedor de pasarelas

El sistema SHALL mantener un `GatewayRegistry` de adaptadores de
pago indexado por nombre de proveedor (persistido en
`Payment.gateway`), de modo que webhook, polling y cualquier
confirmación resuelvan el adaptador que creó la orden.

#### Scenario: Resolución por provider

- **WHEN** llega una confirmación para provider `FLOW`
- **THEN** el registry devuelve el adaptador Flow si está registrado
  (credenciales presentes) o falla 404 si no

#### Scenario: Provider desconocido

- **WHEN** llega `POST /payments/webhook/:provider` con un provider
  no registrado
- **THEN** el sistema responde 404 sin tocar pagos

### Requirement: Webhook normalizado por proveedor

El sistema SHALL exponer `POST /payments/webhook/:provider` que
normaliza la notificación del proveedor a la misma confirmación
(`{refId, status: PAID|FAILED, gatewayData?}`) y la pasa por el
settle idempotente existente. `POST /payments/webhook` (legacy)
rutea al proveedor default.

#### Scenario: Webhook Flow por ruta nueva

- **WHEN** Flow POSTea `{token}` a `/payments/webhook/FLOW`
- **THEN** el adaptador Flow confirma vía `payment/getStatus` y el
  pago se liquida igual que por la ruta legacy

#### Scenario: Webhook legacy intacto

- **WHEN** llega `POST /payments/webhook` (sin provider)
- **THEN** se procesa con el proveedor default (`payments.default_gateway`
  o el único registrado) - compatibilidad del `urlConfirmation` ya
  configurado

#### Scenario: Confirmación normalizada lleva monto/moneda

- **WHEN** un adaptador confirma un pago
- **THEN** la confirmación puede incluir `amount`/`currency` de la
  verdad reportada por el proveedor, y el settle las cruza contra
  el Payment (mismatch → `AMOUNT_MISMATCH` como hoy)

### Requirement: Currency en la orden

El sistema SHALL pasar `Payment.currency` (ISO 4217) al adaptador
en `createOrder`; un adaptador que no soporta la moneda falla la
creación con error explícito.

#### Scenario: Flow recibe la moneda del Payment

- **WHEN** se crea una orden con `currency: "CLP"`
- **THEN** Flow envía `currency=CLP` a `payment/create` (comportamiento
  idéntico a hoy; la diferencia es que ya no está hardcodeado)

#### Scenario: Moneda no soportada

- **WHEN** se pide crear una orden con una moneda que el adaptador
  no soporta
- **THEN** `createOrder` rechaza con error y no se persiste
  `gatewayRef`

### Requirement: Adaptador MercadoPago

El sistema SHALL soportar MercadoPago como `PaymentGateway`
(`name: "MERCADOPAGO"`) cuando existan las credenciales
`MERCADOPAGO_ACCESS_TOKEN`: creación de preference con
`external_reference = refId`, confirmación por webhook
(payment notification → `GET /v1/payments/:id`) y consulta activa
por `external_reference`/`gatewayRef`.

#### Scenario: Crear orden MP

- **WHEN** se crea una orden con el provider MP
- **THEN** devuelve `{paymentUrl: init_point, gatewayRef: preferenceId}`
  y persiste `Payment.gateway = "MERCADOPAGO"`

#### Scenario: Webhook MP approved

- **WHEN** MP notifica un pago `approved` en `/payments/webhook/MERCADOPAGO`
- **THEN** `verifyWebhook` consulta `GET /v1/payments/:id`, devuelve
  `{refId: external_reference, status: "PAID", gatewayData}` con la
  verdad monetaria (net_received_amount, fee_details,
  payment_method_id, date_approved) y el settle liquida el pago

#### Scenario: Webhook MP terminal negativo

- **WHEN** MP notifica `rejected`/`cancelled`/`refunded`
- **THEN** la confirmación normaliza a `FAILED` con el mismo
  `refId` y el settle marca la orden fallida (idempotente)

#### Scenario: Polling MP

- **WHEN** el pago sigue PENDING y el front hace `GET /payments/:id`
- **THEN** `refreshStatus` resuelve el estado remoto por
  `external_reference`/`gatewayRef` y liquida igual que el webhook

### Requirement: Cuentas de pasarela del productor

El sistema SHALL persistir credenciales de pasarela por productor en
`ProducerGatewayAccount` cifradas con AES-256-GCM (`PRODUCER_GATEWAY_KEY`),
exponiendo solo `keyMask` (últimos 4) por API. A lo sumo una cuenta
`ACTIVE` por productor; registrar una nueva desactiva la anterior en la
misma transacción. `STUB` como provider solo es aceptable fuera de
producción.

#### Scenario: Alta de cuenta cifra credenciales

- **WHEN** un productor APPROVED registra `{provider:"FLOW", apiKey,
  secret}`
- **THEN** la fila persiste `credentialsEnc` (blob GCM, nunca el
  secreto plano), `keyMask` = últimos 4 del apiKey, `status:ACTIVE` y
  cualquier cuenta ACTIVE previa queda `DISABLED`

#### Scenario: Respuesta API nunca filtra el secreto

- **WHEN** se consulta `GET /producer/gateway-account`
- **THEN** la respuesta incluye provider/status/keyMask/webhookUrl y
  ninguna forma de las credenciales planas ni del blob utilizable

#### Scenario: Secreto sin key de cifrado

- **WHEN** `PRODUCER_GATEWAY_KEY` no está configurada o es inválida
- **THEN** alta y resolución de adaptador fallan explícito — nunca se
  persiste ni usa material sin cifrar

### Requirement: Routing de órdenes por cuenta propia

El checkout SHALL cobrar las órdenes ligadas a un productor con cuenta
`ACTIVE` por el adaptador de esa cuenta: `Payment.gatewayAccountId` +
`Payment.gateway` = nombre del provider + `feeMode:OWN_GATEWAY` con el
desglose `ownMethodBreakdown(mode:"OWN_GATEWAY")`. Sin cuenta activa la
orden sale por `payments.default_gateway` como hoy.

#### Scenario: Ticket de productor con cuenta propia

- **WHEN** se compra un ticket de un evento cuyo productor tiene cuenta
  `ACTIVE`
- **THEN** `createOrder` se invoca en el adaptador de esa cuenta y la
  orden queda `feeMode:OWN_GATEWAY` + `gatewayAccountId` persistido

#### Scenario: Productor sin cuenta o desactivada

- **WHEN** el productor no tiene cuenta `ACTIVE`
- **THEN** la orden se procesa por el gateway default con `feeMode`
  `MANAGED` y `gatewayAccountId` nulo

### Requirement: Confirmación por cuenta

`POST /payments/webhook/:provider?account=<id>` SHALL resolver el
adaptador de la cuenta indicada y rechazar (400) si la cuenta no
existe, está deshabilitada, su provider difiere del `:provider` de la
ruta, o el Payment resuelto por refId pertenece a otra cuenta. El
polling `GET /payments/:id` SHALL usar el adaptador de
`Payment.gatewayAccountId` cuando esté presente.

#### Scenario: Webhook dirigido a la cuenta correcta

- **WHEN** llega notificación a `/payments/webhook/FLOW?account=A` para
  un pago creado por la cuenta A
- **THEN** `verifyWebhook` corre con las credenciales de A y el settle
  procede normal

#### Scenario: Webhook con cuenta ajena al pago

- **WHEN** `/payments/webhook/FLOW?account=B` notifica un refId cuya
  orden pertenece a la cuenta A
- **THEN** se rechaza 400 — una cuenta no confirma pagos de otra

#### Scenario: Auditoría por cuenta

- **WHEN** el adaptador de una cuenta emite una transacción
- **THEN** `GatewayTransaction.gatewayAccountId` identifica la cuenta y
  un fallo estampa `ProducerGatewayAccount.lastError`

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
