# Delta spec - payments/gateways

## ADDED Requirements

### Requirement: Selección de ambiente Flow

`FLOW_BASE_URL` SHALL aceptar únicamente los endpoints oficiales de
Flow: `https://sandbox.flow.cl/api` (sandbox) y
`https://www.flow.cl/api` (producción). Sin `FLOW_BASE_URL` el default
es sandbox. Cualquier otra URL SHALL fallar el arranque con error
explícito que indique la URL recibida y las aceptadas (fail-close: una
URL de pagos mal configurada no puede derivar órdenes ni webhooks a un
destino arbitrario).

#### Scenario: Default sandbox

- **WHEN** `PAYMENT_GATEWAY=flow` con credenciales y sin
  `FLOW_BASE_URL`
- **THEN** el adaptador Flow apunta a `https://sandbox.flow.cl/api`

#### Scenario: Producción habilitada

- **WHEN** `FLOW_BASE_URL=https://www.flow.cl/api` con credenciales de
  producción
- **THEN** el adaptador Flow se registra apuntando al endpoint
  productivo y las órdenes/webhooks operan contra Flow real

#### Scenario: URL desconocida

- **WHEN** `FLOW_BASE_URL` no es ninguno de los dos endpoints oficiales
- **THEN** el arranque falla con error explícito indicando la URL
  recibida y los endpoints aceptados
