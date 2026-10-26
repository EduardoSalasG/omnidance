# payments/subscriptions — billing events Stripe

## ADDED Requirements

### Requirement: Billing events Stripe para membresías

El webhook STRIPE SHALL enrutar `invoice.paid`,
`invoice.payment_failed` y `customer.subscription.deleted` a la
`MembershipSubscription` cuyo remoteId coincida con la suscripción del
evento, aplicando la misma semántica del reconcile (settle de invoice,
mora, cancelación) con dedup idempotente — la misma invoice procesada
por webhook y por polling SHALL liquidarse una sola vez.

#### Scenario: renovación de membresía Stripe

- **WHEN** llega `invoice.paid` cuya subscription matchea una
  `MembershipSubscription` activa
- **THEN** el settle de renovación corre igual que por reconcile
  (extiende vigencia, emite Payment, dedup por invoice)

#### Scenario: evento sin match

- **WHEN** la subscription del evento no matchea membresía, sub de
  plataforma ni pase social
- **THEN** el webhook responde 200 ignorando el evento

### Requirement: Billing events Stripe para suscripciones de plataforma

El webhook STRIPE SHALL enrutar los mismos eventos a la
`PlatformSubscription` cuyo remoteId coincida, con la semántica del
reconcile de plataforma (RENEWAL_SETTLED restaura tier/limpia gracia y
bloqueo, invoice impaga abre gracia, cancel remoto marca CANCELED).

#### Scenario: invoice impaga de tier

- **WHEN** llega `invoice.payment_failed` para una
  `PlatformSubscription` ACTIVE
- **THEN** abre la ventana de gracia/bloqueo igual que el reconcile —
  sin esperar al polling
