# flow-invoice-amount-string

## Why

En el smoke E2E de suscripciones contra Flow sandbox se descubrió que el primer cobro de una `MembershipSubscription` nunca se liquidaba localmente: `reconcileSubscription` detectaba la invoice pagada pero `payment.create()` explotaba con `Invalid value provided. Expected Int, provided String` (`amount: "25000.0000"`). Flow reporta `invoices[].amount` como **string** (`"25000.0000"`) y `normalizeInvoice` lo pasa crudo, violando el contrato `SubscriptionInvoice.amount: number`. El error es tragado por el try/catch best-effort del refresh, así que el fallo era silencioso. El mismo bug pega en `PlatformSubscriptionsService.reconcile` (PLATFORM_SUB) apenas una invoice de suscripción de academia/productor se pague.

## What Changes

- `FlowGateway.normalizeInvoice`: coerción `Number(inv.amount)` para que `SubscriptionInvoice.amount` salga siempre como `number`.
- `FlowRawInvoice.amount` pasa a `number | string` (tipado honesto del wire de Flow).
- Spec de `flow.gateway.spec.ts`: la fixture de `subscription/get` usa `amount` string (formato real de Flow) y se aserta el tipo numérico normalizado.

## Capabilities

### New Capabilities

(ninguna)

### Modified Capabilities

- `payments/subscriptions`: el requisito de normalización del `RemoteSubscription` se explicita: `invoices[].amount` SHALL salir del adaptador como `number` (Flow lo reporta como string `"25000.0000"`; los consumers lo persisten en `Payment.amount` Int).

## Impact

- `apps/api/src/payments/infrastructure/flow.gateway.ts` (normalizeInvoice + tipo crudo).
- `apps/api/src/payments/infrastructure/flow.gateway.spec.ts` (fixture realista + aserción de tipo).
- Consumers beneficiados sin cambio de código: `SubscriptionsService.reconcileSubscription` (MEMBERSHIP), `PlatformSubscriptionsService.reconcile` (PLATFORM_SUB), y cualquier `RemoteSubscription.invoices[].amount` futuro.
- Stripe no se toca (ya normaliza con `fromMinorUnits`).
