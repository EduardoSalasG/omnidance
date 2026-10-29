# Change: pase-social

## Por qué

La suscripción del bailarín es la pieza económica del roadmap
multipaís: un pase mensual que le vale en cualquier ciudad (el
modelo del social, no el de academia). Decisiones de producto ya
tomadas: los **créditos aplican a sociales, prácticas y eventos**
(nunca a clases de academia); el suscriptor **siempre paga
preventa y nunca el cargo de puerta**; el no-suscriptor paga precio
productor + cargo de puerta (~$1.000). Reembolsos fuera de scope.

## Qué cambia

- **`SocialPass`** (nuevo modelo, `personId @unique`): suscripción
  del bailarín sobre Stripe Billing; `{personId, stripeCustomerId,
  stripeSubId, status, amount, currency, creditsPerPeriod,
  creditsBalance, lastCreditResetAt, currentPeriodEnd,
  cancelAtPeriodEnd, tierCode}`.
- **`SocialPassLedger`** (nuevo): movimientos auditable de crédito
  `{personId, delta, reason RESET|REDEEM|GRANT, paymentId?, createdAt}`
 ; el balance nunca se muta sin línea.
- **Precio por país**: `TierPrice` ya existe (`tierCode` × país →
  `{amount,currency}`); `tierCode:"SOCIAL_PASS"` resuelve precio por
  `Person.jurisdiction`/país con fallback CL. Créditos por período
  vía param `social_pass.credits_per_month` (default 4).
- **`StripeGateway` implementa `SubscriptionProvider`** (el slot del
  port ya existe): `ensurePlan`/`syncPlan` (Product+Price espejo en
  la cuenta de plataforma), `createCustomer`/`getCustomer`,
  `createSubscription` → Checkout Session `mode=subscription`
  (`subscription_data.metadata.personId`), `getSubscription`,
  `cancelSubscription` (cancel_at_period_end). `registerCustomerCard`
  mapea a la propia sesión de Checkout (Stripe cobra el 1er período
  y toma tarjeta ahí mismo; el flujo needs_card de Flow se traduce
  a "redirect a Checkout").
- **Webhook**: `POST /payments/webhook/STRIPE` gana routing por tipo
  de evento; `invoice.paid` → activar/renovar + reset de créditos
  (`RESET` ledger al allotment del período), `invoice.payment_failed`
  → `FAILED_CARD`, `customer.subscription.deleted` → `CANCELED`;
  firme `Stripe-Signature` igual que el path de órdenes. Metadata
  `personId` en customer/subscription ata el evento al `SocialPass`.
- **Beneficios en checkout de ticket**: con pass ACTIVE el checkout
  usa `presalePrice` aunque la preventa haya cerrado y exime
  `doorAppFeeClp` (el desglose lo marca: línea "Pase Social"); sin
  pass el comportamiento actual no cambia. Opción `payWithCredit`
  → entrada $0 consumiendo 1 crédito por entrada (Payment
  `gateway:"FREE"` + `SocialPassLedger REDEEM` atómico al orden);
  sin crédito suficiente → 409.
- **Endpoints** (`/me/social-pass`): `GET` (estado, período,
  créditos restantes), `POST /subscribe` → Checkout subscription
  URL, `POST /cancel` → `cancelAtPeriodEnd`.
- **Front**: página `/pase` (pública, gated por flag; pitch +
  precio por jurisdicción + CTA subscribe; miembro: estado/período/
  créditos restantes/cancelar en 2 pasos); indicador del precio
  beneficiado en checkout ("pagas preventa con Pase Social");
  opción "usar crédito" cuando aplica; entrada en nav cuando flag ON.
- **Gating total**: flag `social_pass` (seed **OFF**; nace
  desactivado): OFF → endpoints 404, front sin enlaces ni página.
- Migración + specs + i18n es-CL.

## Fuera de scope

- Reembolsos/cancelación retroactiva (decisión de producto).
- Trials, pausas, cambio de plan, múltiples planes del pase,
  créditos acumulables entre períodos (reset duro por período;
  política explícita del copy).
- Connect destination charges para suscripciones (siempre plataforma).
- Connect webhook events en cuenta del productor (own-gateway
  confirmaba por polling; igual acá no aplica, es plataforma).
