# Proposal; flow-e2e-smoke-fixes

## Why

Smoke e2e real contra Flow sandbox (pago one-off completado:
flowOrder 11431518, $5.000 PAID) expuso dos bugs que el stub
nunca reveló:

1. **Webhook 500**: `PaymentSettlementService` escribe
   `Payment.gatewayCurrency` en el claim PAID, columna inexistente
   en el schema (se coló en `multipais-currency` sin migrar; el
   spread de `data` evade el excess-property check, así que tsc no
   lo veía). Prisma rechaza → 500 → "Alerta: Problema de
   integración" de Flow.
2. **Retorno a /login**: el `urlReturn` apuntaba directo a
   `/checkout/return` (ruta protegida). Flow devuelve al pagador con
   POST cross-site y las cookies de sesión no viajan
   (SameSite=Lax) → middleware redirige a /login tras pagar.

## What Changes

- Migración `20261101190000_payment_gateway_currency`: columna
  `Payment.gatewayCurrency String?` (verdad monetaria reportada por
  la pasarela, auditable vs `currency`).
- Nuevo endpoint público `GET|POST /payments/order-return`: recibe
  el retorno de la pasarela y responde 303 a
  `${WEB_URL}/checkout/return?paymentId=<id>` - la navegación GET
  resultante sí lleva la cookie de sesión. Mismo patrón que
  `flow/customer-return`.
- `checkout.service.ts`: los 5 `returnUrl` de órdenes one-off
  (ticket, series-pass, membership, class, private-class) apuntan a
  `${API_URL}/api/payments/order-return?paymentId=<id>`.

## Out of scope

- Regenerar/recuperar Payment PENDING atascado por el webhook 500:
  el polling `refreshStatus` en `GET /payments/:id` lo liquida solo.
- `customer/collect` para cobros sueltos plataforma→actor (backlog).
