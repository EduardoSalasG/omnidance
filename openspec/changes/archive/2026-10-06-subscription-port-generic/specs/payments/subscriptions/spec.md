# Delta spec - payments/subscriptions

## ADDED Requirements

### Requirement: Tipos normalizados del puerto de suscripciones

`SubscriptionProvider` SHALL devolver `RemoteSubscription` con campos
normalizados (`status` enum ACTIVE/CANCELED/PENDING/UNKNOWN +
`rawStatus`, `morose`, `cancelAtPeriodEnd`, `nextInvoiceDate`,
`invoices[].paid` ya resuelto por el adaptador,
`payment.{orderRef,data}` con `data` = NormalizedGatewayData).
Ningún consumer de dominio interpreta códigos numéricos del proveedor.

#### Scenario: Suscripción remota activa

- **WHEN** el adaptador consulta una suscripción vigente
- **THEN** devuelve `status:"ACTIVE"` independientemente del código
  crudo del proveedor (conservado en `rawStatus`)

#### Scenario: Suscripción remota cancelada

- **WHEN** el proveedor reporta la suscripción cancelada (Flow status 4)
- **THEN** devuelve `status:"CANCELED"` y el reconcile marca la local
  `CANCELED`

#### Scenario: Invoice pagada

- **WHEN** el adaptador normaliza invoices
- **THEN** cada invoice lleva `paid` ya resuelto según la regla del
  proveedor y `payment.data` = verdad monetaria normalizada

### Requirement: Selección de provider de suscripciones

Los services SHALL resolver el provider vía param
`payments.subscription_gateway` contra el `GatewayRegistry` y exigir
capability `SubscriptionProvider` por presencia de métodos.

#### Scenario: Provider registrado con capability

- **WHEN** `payments.subscription_gateway` apunta a un adaptador que
  implementa `SubscriptionProvider`
- **THEN** subscribe/cancel/reconcile operan sobre ese adaptador

#### Scenario: Provider sin capability

- **WHEN** el provider resuelto no implementa `SubscriptionProvider`
  (p.ej. MERCADOPAGO hoy)
- **THEN** los flujos de suscripción fallan con error explícito de
  capability, nunca caen en silencio a otro provider

### Requirement: Compatibilidad de comportamiento

La semántica de reconcile/cancel/mora/compensación SHALL conservarse
1:1 respecto al comportamiento previo a la normalización.

#### Scenario: Estado remoto desconocido

- **WHEN** el proveedor reporta un código no mapeado
- **THEN** el adaptador emite `status:"UNKNOWN"` con `rawStatus` y el
  service lo trata como vigente (log de warning), igual que antes
