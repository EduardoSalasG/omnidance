# Checkout + Tickets + Discount Codes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development o superpowers:executing-plans.

**Goal:** Un usuario compra una entrada en preventa (stub de pasarela, Flow detrás de puerto), recibe un Ticket ACTIVE, y los códigos de descuento tipificados aplican con tracking completo.

**Architecture:** Puerto `PaymentGateway` en dominio → adapter `FlowGateway` (crea orden y retorna URL de pago; webhook confirma). En dev, adapter `StubGateway` auto-aprueba. Checkout crea `Payment` PENDING + Ticket solo al confirmar.

**Tech Stack:** NestJS, Prisma, jose, class-validator.

**Spec:** `omni-dance.md` §10 (reglas: puerta, discount codes tipificados, sin refunds), § ticketing/liquidaciones.

## Global Constraints

- Sin reembolsos de ningún tipo (caveat legal ya documentado).
- `DiscountCode.type` es enum cerrado: CUMPLEANOS | CORTESIA | CASO_BORDE_PUERTA | CAMPAIGN | WINBACK | STAFF_COMP.
- Todo redemption queda auditado (`DiscountRedemption` con personId + paymentId).
- Fee plataforma omnidance: serviceFee = % configurable por env `SERVICE_FEE_PCT` (default 8%).
- Hexagonal: dominio puro, adapters NestJS/Prisma/HTTP.

---

### Task 1: Dominio checkout — pricing + puerto PaymentGateway

**Files:**
- Create: `src/payments/domain/payment-gateway.ts` (puerto + tokens)
- Create: `src/payments/domain/pricing.service.ts` (cálculo puro)
- Test: `src/payments/domain/pricing.service.spec.ts`

**Interfaces:**
- Produces:
  - `PaymentGateway.createOrder(params: { amount, email, refId, returnUrl }): Promise<{ paymentUrl, gatewayRef }>`
  - `PaymentGateway.verifyWebhook(body, signature): Promise<{ refId, status: "PAID"|"FAILED" }>`
  - `PricingService.quote({ listPrice, serviceFeePct, discount?: { percentOff?, amountOff? } }): { listPrice, discount, serviceFee, total }` — total nunca < 0; amountOff no excede listPrice.

- [ ] Test: quote sin descuento = list + fee; percentOff aplica sobre lista; amountOff cap en lista; total mínimo 0.
- [ ] Implementación pura. Commit.

### Task 2: Adapters gateway — Stub (dev) + Flow skeleton

**Files:**
- Create: `src/payments/infrastructure/stub.gateway.ts`
- Create: `src/payments/infrastructure/flow.gateway.ts`

**Interfaces:**
- `StubGateway`: `createOrder` retorna `{ paymentUrl: "stub://pay/<ref>", gatewayRef: "stub-<ref>" }`; `verifyWebhook` parsea el stub.
- `FlowGateway`: POST `https://www.flow.cl/api/payment/create` con `FLOW_API_KEY`/`FLOW_SECRET` (HMAC firma de params); si env falta → throw `NotImplemented` (documentado para cuando haya cuenta).

- [ ] Test del stub round-trip. Commit.

### Task 3: Checkout — crear orden + webhook + emisión de ticket

**Files:**
- Create: `src/payments/infrastructure/checkout.controller.ts`
- Create: `src/payments/infrastructure/prisma-payments.repo.ts`
- Create: `src/payments/payments.module.ts`
- Test: `test/checkout.e2e.spec.ts`

**Interfaces:**
- `POST /api/checkout/ticket` (SessionGuard) body `{ eventId, discountCode? }` →
  1. evento PUBLISHED + presalePrice; valida presaleCap no agotado.
  2. discountCode: existe, no expirado, eventId/seriesId matchea, usedCount < maxUses.
  3. quote → crea `Payment` PENDING (orderType TICKET) + `DiscountRedemption` pendiente.
  4. `gateway.createOrder` → `{ paymentUrl }`.
- `POST /api/payments/webhook` (público, verifica firma gateway) → PAID: crea `Ticket` ACTIVE (owner=buyer, listPrice, serviceFee), `DiscountRedemption.paymentId`, `usedCount++`. FAILED: Payment FAILED.
- Idempotencia webhook: si Payment ya PAID → 200 sin duplicar ticket.

- [ ] e2e: checkout con stub → webhook PAID → ticket existe, redemption linkeada, usedCount=1. Re-webhook no duplica. Código expirado → 400. Commit.

### Task 4: Discount codes — crear + listar (productor)

**Files:**
- Create: `src/discounts/infrastructure/discounts.controller.ts`
- Create: `src/discounts/discounts.module.ts`
- Test: `test/discounts.e2e.spec.ts`

**Interfaces:**
- `POST /api/discount-codes` (roles PRODUCER o ADMIN) body `{ code, type, eventId?, seriesId?, percentOff?, amountOff?, maxUses?, expiresAt? }` → type es enum validado por class-validator.
- `GET /api/discount-codes?eventId=` → lista con usedCount/maxUses.

- [ ] e2e: crear código CAMPAIGN, listar, rechazar type inválido (400), rechazar rol DANCER (403). Commit.

### Task 5: Web checkout mínimo

**Files:**
- Create: `apps/web/src/app/eventos/[id]/checkout/page.tsx`
- Modify: `apps/web/src/app/eventos/[id]/page.tsx` (CTA → checkout real)

**Interfaces:**
- `/eventos/[id]/checkout`: muestra precio + campo opcional código → POST `/api/checkout/ticket` → redirect a `paymentUrl` (en dev stub muestra "simular pago aprobado" que llama al webhook — solo en `NODE_ENV!=="production"`).
- i18n strings nuevas en `messages/es-CL.json`.

- [ ] `tsc --noEmit` + `next build` verdes + flujo manual dev. Commit.

---

## Self-Review
- Cobertura spec: checkout preventa ✓, discount tipificado+tracking ✓, ticket ACTIVE al pagar ✓, webhook idempotente ✓, service fee ✓. Gift/transfer, SeriesPass, refunds-legales → siguiente plan.
- Sin placeholders; firmas consistentes entre tasks.
