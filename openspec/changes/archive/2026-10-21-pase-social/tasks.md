# Tasks — pase-social

- [x] 1. Schema `SocialPass` + `SocialPassLedger` + migración
  (orquestador); seed param `social_pass.credits_per_month=4` +
  `TierPrice` `SOCIAL_PASS` para CL (precio base, p.ej. 15000 CLP —
  param editable).
- [x] 2. `StripeGateway` implementa `SubscriptionProvider` completo
  (spec payments/subscriptions del change): ensurePlan/syncPlan
  Product+Price, createCustomer/getCustomer, createSubscription
  (Checkout mode=subscription, metadata.personId), getSubscription,
  cancelSubscription (cancel_at_period_end), normalización
  RemoteSubscription. `payments.subscription_gateway` acepta STRIPE.
- [x] 3. `SocialPassService`: precio por TierPrice×país (fallback
  CLP); `GET /me/social-pass` (estado/período/créditos);
  `POST /me/social-pass/subscribe` → session URL;
  `POST /me/social-pass/cancel` → cancel_at_period_end; reset de
  créditos por `invoice.paid` con ledger `RESET`; audit.
- [x] 4. Webhook STRIPE routing por event.type: `invoice.paid` →
  SocialPass activate/renew + RESET créditos;
  `invoice.payment_failed` → FAILED_CARD;
  `customer.subscription.deleted` → CANCELED — todo firmado por
  el mismo `Stripe-Signature`; specs.
- [x] 5. Checkout: beneficios ACTIVE (presale siempre + exentar
  doorAppFee, línea visible en desglose) + `payWithCredit`
  (orden $0 + REDEEM atómico + 409 sin saldo).
- [x] 6. Front: `/pase` pública gated (pitch + precio por
  jurisdicción + subscribe; miembro → estado/créditos/cancel 2
  pasos); CTA/flag en nav; indicador "precio Pase Social" en
  checkout + opción crédito; i18n es-CL, impeccable.
- [x] 7. architecture.md + qa-inventory + openapi regen;
  validate + archive (orquestador).
