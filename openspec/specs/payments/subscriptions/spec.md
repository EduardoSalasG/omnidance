# payments/subscriptions Specification

## Purpose
TBD - created by archiving change subscription-port-generic. Update Purpose after archive.

## Requirements

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
  moneda no soportada — nunca caen en silencio a un provider de CLP

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

### Requirement: Suscripción del bailarín sobre Stripe Billing

`StripeGateway` SHALL implementar `SubscriptionProvider`:
`ensurePlan`/`syncPlan` crean/actualizan Product+Price espejo en la
cuenta de plataforma por `tierCode`×moneda; `createCustomer`/
`getCustomer` manejan el Customer Stripe del bailarín;
`createSubscription` SHALL crear una Checkout Session
`mode=subscription` con `subscription_data.metadata.personId` y
devolver su URL (el registro de tarjeta ocurre dentro de Checkout);
`getSubscription`/`cancelSubscription` normalizan al `RemoteSubscription`
del port (`cancelAtPeriodEnd`, `nextInvoiceDate`, `morose` por
`invoice.payment_failed`/`past_due`). `payments.subscription_gateway`
SHALL aceptar `STRIPE` como motor válido para el pase.

#### Scenario: Suscripción vía Checkout

- **WHEN** un bailarín suscribe y Stripe crea la Checkout Session
- **THEN** vuelve a la app y `invoice.paid` (webhook firmado) activa
  su `SocialPass` — la confirmación v1 puede además resolverse por
  `getSubscription` al regresar (mismo patrón polling del checkout)

### Requirement: Créditos del pase

`SocialPass.creditsBalance` SHALL consumirse solo vía
`SocialPassLedger` (`RESET` al allotment `creditsPerPeriod` en cada
`invoice.paid`, `REDEEM` por entrada pagada con crédito, `GRANT`
manual admin). El reset SHALL ser duro por período (créditos no
acumulan — copy explícito al usuario). Créditos aplican a
tickets de eventos sociales/prácticas — NUNCA a membresías, clases
o productos de academia.

#### Scenario: Renovación resetea

- **WHEN** `invoice.paid` de un ciclo nuevo llega
- **THEN** `creditsBalance = creditsPerPeriod` y el ledger gana
  `RESET` — el remanente anterior se pierde

#### Scenario: Redención atómica

- **WHEN** el bailarín usa 1 crédito en una entrada
- **THEN** decrementar el balance + `REDEEM` + crear la orden $0 va
  en la misma transacción — sin crédito suficiente → 409 y nada muta

### Requirement: Beneficios de precio en checkout

Con `SocialPass` `ACTIVE` el checkout de ticket SHALL usar
`presalePrice` aunque la preventa haya cerrado, y SHALL eximir
`doorAppFeeClp` (desglose con línea visible del beneficio). Sin pass,
el pricing actual no cambia. El beneficio aplica al comprador
suscrito — nunca a tickets para terceros/regalos del mismo orden.

#### Scenario: Suscriptor en puerta

- **WHEN** un bailarín con pass ACTIVE compra ya cerrada la preventa
- **THEN** paga `presalePrice` sin `doorAppFeeClp`; el desglose lo
  muestra como beneficio del pase

### Requirement: Gating por flag

Todos los endpoints y superficies del pase SHALL responder 404 con
`social_pass` apagado y el front SHALL no renderizar enlaces,
CTAs ni la página `/pase`.

#### Scenario: Flag OFF

- **WHEN** `social_pass` está `enabled:false`
- **THEN** `GET /me/social-pass` → 404, `/pase` no se enlaza en nav
  y el checkout no muestra beneficios aunque exista `SocialPass`
