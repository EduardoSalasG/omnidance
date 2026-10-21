# Delta: payments/subscriptions (pase-social)

## ADDED Requirements

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
