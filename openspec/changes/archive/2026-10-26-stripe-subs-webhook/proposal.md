# Proposal — stripe-subs-webhook

## Why

`multipais-currency` habilitó suscripciones no-CLP sobre Stripe Billing
(membresías de academia y suscripciones de plataforma), pero el webhook
de Stripe solo alimenta el Pase Social — renovaciones/fallos/cancel de
membresías y subs de plataforma dependen del polling del reconcile.
Sin billing events reales, una membresía Stripe puede quedar en grace
innecesaria o un cancel remoto no propagarse.

## What Changes

- El dispatcher del webhook STRIPE SHALL enrutar eventos billing
  (`invoice.paid`, `invoice.payment_failed`,
  `customer.subscription.deleted`) a los tres consumidores según el
  target: `SocialPass` (metadata `socialPass`/`planId` del pase),
  `MembershipSubscription` (remoteId de Stripe) y
  `PlatformSubscription` (remoteId/tier).
- Cada evento SHALL liquidarse idempotente por dedup existente
  (`lastInvoiceId`/`refId` en membresías; invoice dedup en plataforma).
- Sin comportamiento nuevo para Flow/CLP — el rail chileno intacto.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `payments/subscriptions`: billing events Stripe para membresías.
- `platform-billing`: billing events Stripe para subs de plataforma.

## Impact
- `stripe.gateway.ts` (event parse ya existe), webhook controller de
  payments, `subscriptions.service`, `platform-subscriptions.service`.
- Sin schema, sin front.
