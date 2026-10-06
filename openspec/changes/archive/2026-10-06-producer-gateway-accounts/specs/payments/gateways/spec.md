# Delta spec - payments/gateways

## ADDED Requirements

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
