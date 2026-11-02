# receipt-subject-pagaste

## Why

El asunto del mail de resguardo (`Respaldo de tu pago - <producto>`) suena a documento administrativo. Pedido del usuario: asunto directo en voz de la compra, `Pagaste: <producto>`.

## What Changes

- Asunto del mail de resguardo: `Respaldo de tu pago - ${product}` → `Pagaste: ${product}`.
- Producto de membresía: `${plan.name} · ${academy.name}` → `${plan.name}, ${academy.name}` (ej. "Pagaste: Esencial, Clave Timba").
- Título HTML (`emailShell`) alineado: `Pagaste: ${product} · ${amountLabel}`.
- Spec: aserción de asunto en el test de mail MEMBERSHIP.

## Capabilities

### New Capabilities

(ninguna)

### Modified Capabilities

- `payments/notifications`: se explicita el formato del asunto del resguardo (`Pagaste: <producto>`).

## Impact

- `apps/api/src/payments/application/payment-settlement.service.ts` (asunto + producto MEMBERSHIP).
- `apps/api/src/payments/infrastructure/receipt-emails.ts` (título del shell).
- `apps/api/src/payments/application/payment-settlement.service.spec.ts` (aserción).
