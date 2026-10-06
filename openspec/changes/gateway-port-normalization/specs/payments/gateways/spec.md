# Delta spec - payments/gateways

## ADDED Requirements

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
