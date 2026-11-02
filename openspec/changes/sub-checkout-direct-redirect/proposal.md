# sub-checkout-direct-redirect

## Why

Dos fricciones UX reportadas al probar suscripciones E2E: al suscribirse, `needs_card` mostraba un interstitial "agrega tu tarjeta a Flow" en vez de saltar directo al disclaimer, y el retorno del registro de tarjeta aterrizaba en la ficha pública de la academia con `?sub=ok` en vez de la página de éxito compartida que ya usan los checkouts (`/checkout/return`).

## What Changes

- `needs_card` en checkout de membresía y en `/academia/suscripcion` SHALL redirigir de inmediato (`location.href = registerUrl`), igual que ya hace `SubscriptionManage.resumeCardRegistration`.
- `POST /payments/flow/customer-return` SHALL redirigir a `/checkout/return?sub=ok|error&src=member` (antes `/academias/:id?sub=…`).
- `/checkout/return` SHALL resolver el CTA post-sub por `src`: `member` → `/academias`; default → `/academia/suscripcion`.

## Capabilities

### Modified Capabilities

- `payments/subscriptions`: flujo needs_card sin interstitial + retorno a página de éxito compartida.

## Impact

- `apps/api/src/payments/infrastructure/webhook.controller.ts`
- `apps/web/.../checkout/return/page.tsx`
- `apps/web/.../academias/[id]/checkout/membership-checkout-client.tsx`
- `apps/web/src/components/academy/academy-billing.tsx`
