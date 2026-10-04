# Tasks — class-dropin-checkout

## 1. Schema + refs

- [x] 1.1 `ClassBooking.paymentId String?` + migración versionada.
- [x] 1.2 `order-ref.ts`: `encodeClassRef`/`decodeClassRef` (`wks_<classId>_<uuid>`).

## 2. Checkout + settle (TDD)

- [x] 2.1 Tests rojos: `purchaseClass` (validaciones 404/400/409, orden
  creada con unit economics), `classQuote`, `settleClassDropin` (BOOKED con
  cupo, WAITLIST sin cupo, idempotencia, FAILED no crea reserva).
- [x] 2.2 `CheckoutService.purchaseClass` + `classQuote`; rutas
  `POST /checkout/class` y `GET /checkout/class-quote`.
- [x] 2.3 `PaymentSettlementService` → rama WORKSHOP.
- [x] 2.4 `classes.controller`: conteo de cuota excluye `paymentId`;
  `detail()` expone `myBookingPaid`; cancel de reserva pagada → refunded=false.
- [x] 2.5 Payouts ACADEMY + `by-academy` + `withContextNames` incluyen WORKSHOP.

## 3. UI

- [x] 3.1 `class-booking-cta`: CTA "Comprar clase suelta" cuando no hay cuota
  usable y hay `dropInPrice` + cupo; sheet con quote (list+fee=total) → POST →
  redirect. Copy de cancelación para asiento pagado.
- [x] 3.2 `/checkout/return`: WORKSHOP → "Ir a Mis clases".
- [x] 3.3 i18n parts.

## 4. Cierre

- [x] 4.1 Tests + `tsc` api/web + build; e2e con StubGateway si aplica.
- [x] 4.2 `openspec validate --strict`; docs (architecture, flows); handoff.
