# Tasks; flow-e2e-smoke-fixes

- [x] 1. Schema: `Payment.gatewayCurrency String?` + migración
  `20261101190000_payment_gateway_currency` (aplicada, 73 migraciones)
- [x] 2. Endpoint `GET|POST /payments/order-return` → 303 a
  `/checkout/return?paymentId=` de la web
- [x] 3. `checkout.service.ts`: 5 returnUrl →
  `${API_URL}/api/payments/order-return`
- [x] 4. `prisma generate` + `tsc --noEmit` limpio
- [x] 5. `refreshStatus`: param `commerceOrder` → `commerceId` (Flow
  responde 400 "Missing service params: commerceId"; el polling de
  `GET /payments/:id` nunca confirmaba)
- [ ] 6. Smoke e2e: re-compra → retorno con sesión → ticket emitido;
  pago atascado `cmvy5zxn2000t91nwe16umazu` liquida por polling al
  revisitar la ficha
