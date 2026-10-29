# Design; stripe-subs-webhook

## Contexto

`StripeGateway.verifyWebhook` ya normaliza billing events
(`billingFromInvoice` → `BillingWebhookEvent` con `socialPass` desde
metadata) y el controller los enruta hoy a `SocialPassService`.
Tras multipais-currency, `MembershipSubscription` y
`PlatformSubscription` también viven en Stripe para monedas no-CLP y
tienen su id remoto persistido (`flowSubscriptionId`/`remoteRefs` y el
remoteId de la sub de plataforma).

## Decisión

Un dispatcher por target, no un consumer gigante:

1. `metadata.socialPass==="1"` o planId del price = pase → `SocialPassService` (actual, ya aislado por metadata).
2. La `subscriptionId` del evento matchea `MembershipSubscription` por su remoteId → `SubscriptionsService` (reconcile puntual sobre esa sub: `invoice.paid`→settle membership invoice, `payment_failed`→mora/FAILED_CARD, `customer.subscription.deleted`→CANCELED).
3. Matchea `PlatformSubscription` por remoteId → `PlatformSubscriptionsService` (misma semántica: settle renewal, mora/grace, CANCELED).
4. Sin match en ninguno → ack ignorado (comportamiento actual).

Dedup: reusar `lastInvoiceId`/`refId` existentes; la misma invoice por
webhook y por polling no liquida dos veces.

## Verificación

Specs vitest con webhook events fake: membresía `invoice.paid` settlea,
`payment_failed` marca mora, `deleted`→CANCELED; platform sub igual;
evento sin match → ignora; dedup webhook+polling.
