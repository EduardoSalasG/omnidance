# payments/subscriptions; provider por moneda

## MODIFIED Requirements

### Requirement: Selección de provider de suscripciones

Los services SHALL resolver el provider por moneda del cobro: para CLP
el param `payments.subscription_gateway` se resuelve contra el
`GatewayRegistry`; para otra moneda SHALL usarse el primer adaptador
registrado que implemente `SubscriptionProvider` y cuyo `currencies`
la soporte (sin declaración = sin restricción). En ambos casos la
capability `SubscriptionProvider` SHALL exigirse por presencia de
métodos.

#### Scenario: Provider registrado con capability

- **WHEN** la moneda del cobro es CLP y `payments.subscription_gateway`
  apunta a un adaptador que implementa `SubscriptionProvider`
- **THEN** subscribe/cancel/reconcile operan sobre ese adaptador

#### Scenario: Provider por moneda no-CLP

- **WHEN** la moneda del cobro no es CLP
- **THEN** se usa el primer adaptador con `SubscriptionProvider` que la
  soporte (p.ej. STRIPE para USD/EUR/MXN), ignorando el param

#### Scenario: Moneda sin proveedor

- **WHEN** ningún adaptador registrado implementa
  `SubscriptionProvider` y soporta la moneda
- **THEN** los flujos de suscripción fallan con error explícito de
  moneda no soportada; nunca caen en silencio a un provider de CLP

#### Scenario: Provider sin capability

- **WHEN** el provider resuelto no implementa `SubscriptionProvider`
  (p.ej. MERCADOPAGO hoy)
- **THEN** los flujos de suscripción fallan con error explícito de
  capability, nunca caen en silencio a otro provider
