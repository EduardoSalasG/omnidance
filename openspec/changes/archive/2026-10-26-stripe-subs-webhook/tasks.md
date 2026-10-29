# Tasks; stripe-subs-webhook

- [x] 1. Dispatcher: en el controller del webhook STRIPE, enrutar
      billing events por target; socialPass metadata → SocialPass
      (actual); remoteId en MembershipSubscription →
      SubscriptionsService; remoteId en PlatformSubscription →
      PlatformSubscriptionsService; sin match → ack ignorado.
- [x] 2. Membership: método que aplique el billing event sobre UNA sub
      (settle invoice paid / mora payment_failed / CANCELED deleted)
      reusando la lógica del reconcile puntual, dedup por invoice.
- [x] 3. Platform sub: idem (RENEWAL_SETTLED/gracia/CANCELED).
- [x] 4. Specs vitest con eventos fake por cada target + sin-match +
      dedup webhook/polling.
- [x] 5. Docs: nota en `docs/architecture.md` (webhook Stripe ahora
      cubre los 3 consumidores).
