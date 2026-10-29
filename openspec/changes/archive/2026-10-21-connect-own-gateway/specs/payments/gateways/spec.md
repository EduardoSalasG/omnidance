# Delta: payments/gateways (connect-own-gateway)

## ADDED Requirements

### Requirement: Cuenta propia Stripe Connect del productor

`ProducerGatewayAccount` SHALL aceptar provider `STRIPE` cuyas
credenciales persisten `{accountId}` (la `acct_…` de un
`PayoutDestination` ACTIVE del actor; sin destino activo el alta
rechaza 400 guiando a conectar primero). `createOrder` SHALL crear la
Checkout Session con header `Stripe-Account: <accountId>` (cargo
directo en la cuenta del productor) y `refreshStatus` SHALL consultar
la sesión con el mismo header. El desglose `OWN_GATEWAY` SHALL seguir
idéntico al resto de providers (comisión devengada, neteada en
payout; nunca `application_fee_amount` en el cargo).

#### Scenario: Alta referencia el destino del actor

- **WHEN** un productor con `PayoutDestination` STRIPE_CONNECT ACTIVE
  registra `PUT /producer/gateway-account {provider:"STRIPE"}`
- **THEN** la cuenta persiste `credentialsEnc={accountId}`, `keyMask`
  = últimos 4 del `acct_`, status ACTIVE y desactiva la previa

#### Scenario: Alta sin destino activo

- **WHEN** un productor sin `PayoutDestination` ACTIVE intenta
  registrar STRIPE
- **THEN** 400 indicando que primero conecte su cuenta en
  `/productor/pagos`; nunca se persiste una cuenta sin `acct_`

#### Scenario: Cobro directo en la cuenta conectada

- **WHEN** se compra un ticket de un productor con cuenta STRIPE
  ACTIVE
- **THEN** `createOrder` POSTea `/v1/checkout/sessions` con header
  `Stripe-Account: acct_…`; la plata llega directo al productor y la
  orden queda `feeMode:"OWN_GATEWAY"` + `gatewayAccountId` persistido

#### Scenario: Confirmación por polling en la cuenta

- **WHEN** `GET /payments/:id` consulta el estado de una orden
  OWN_GATEWAY STRIPE PENDING
- **THEN** `refreshStatus` consulta `GET /v1/checkout/sessions/{cs_…}`
  con `Stripe-Account: <accountId>` y liquida igual que el webhook de
  plataforma
