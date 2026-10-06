# Delta: payments (fintoc-gateway-adapter)

## ADDED Requirements

### Requirement: adaptador Fintoc para órdenes de un solo cargo

El sistema SHALL exponer `FINTOC` como provider del GatewayRegistry
cuando exista `FINTOC_SECRET_KEY`. `createOrder` SHALL crear una
checkout session `flow:"payment"` con `metadata.refId`, devolver
`redirect_url` como `paymentUrl` y persistir el `cs_…` id como
`Payment.gatewayRef`. SHALL rechazar monedas fuera de {CLP, MXN}.

#### Scenario: createOrder exitoso

- **WHEN** se crea una orden FINTOC por CLP 5000
- **THEN** el sistema POSTea a `/v2/checkout_sessions` con
  flow `payment`, amount 5000, currency CLP y `metadata.refId`, y
  devuelve `redirect_url` + `gatewayRef` = id de la sesión

### Requirement: verificación firmada del webhook

El sistema SHALL rechazar todo webhook FINTOC cuya firma
`Fintoc-Signature` no verifique (HMAC-SHA256 de `t.rawBody` con
`FINTOC_WEBHOOK_SECRET`, tolerancia de reloj ≤5min) o cuando falte la
firma o el body crudo. Tras validar, SHALL confirmar el estado por
`GET /v2/checkout_sessions/:id` (fetch-confirm) antes de liquidar.

#### Scenario: firma válida + sesión terminada

- **WHEN** llega `checkout_session.finished` con firma válida
- **THEN** el sistema GETea la sesión, extrae `metadata.refId` y liquida
  PAID con `gatewayData` normalizado (amount, currency, media, raw)

#### Scenario: firma inválida o ausente

- **WHEN** el header falta, no verifica, o el timestamp excede 5 min
- **THEN** responde webhook inválido sin consultar ni liquidar

#### Scenario: evento no terminal

- **WHEN** el evento es válido pero la sesión no está en estado terminal
- **THEN** responde error para que Fintoc reintente (misma semántica que
  el adaptador MercadoPago)

### Requirement: polling por gatewayRef

`GET /payments/:id` SHALL consultar `refreshStatus` con el `cs_…`
persistido en `Payment.gatewayRef` para órdenes FINTOC PENDING.

#### Scenario: sesión expirada

- **WHEN** la sesión consultada está `expired`
- **THEN** el polling liquida FAILED por el mismo settle del webhook
