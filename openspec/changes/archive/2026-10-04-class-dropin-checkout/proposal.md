# class-dropin-checkout

## Why

`ClassSeries.dropInPrice` existe de punta a punta (schema, CRUD de series
en la consola, `ClassCardData`, ficha de clase con `PriceTag`) pero **no hay
forma de pagarlo**: la "clase suelta" se muestra y no se vende. Eso deja sin
cubrir dos cosas de la spec §11 — los **talleres pagos** (un taller es una
clase suelta con mejor merchandising) y el ingreso por clase de quien no es
alumno de la academia. Además, hoy quien no tiene inscripción vigente ve
"Ver planes" como única salida: comprar UNA clase debería ser el camino de
menor fricción, no exigir mensualidad.

## What Changes

- **Checkout de clase suelta**: `POST /checkout/class {classId}` — valida
  clase futura/no cancelada, serie con `dropInPrice`, cupo disponible y que
  el viewer no tenga ya una reserva que consuma (BOOKED o WAITLIST);
  crea `Payment` `orderType WORKSHOP` con refId `wks_<classId>_<uuid>`,
  `service_fee.membership_clp` como cargo (mismo param que membresía) y
  delega a la pasarela igual que `purchaseMembership`.
- **Settle WORKSHOP**: `PaymentSettlementService` gana la rama — al PAID
  materializa `ClassBooking` `BOOKED` (o `WAITLIST` si el cupo se llenó en
  la ventana compra→pago) con `enrollmentId=null` — una compra suelta no
  consume ni exige cuota. Notifica `payment.paid` con nombre de la clase.
- **Cancelación de compra suelta**: `DELETE /classes/:id/book` libera el
  asiento igual que hoy; el `refunded` del crédito no aplica (no hay crédito
  — la reserva pagada nunca "devuelve" plata en v1; la devolución monetaria
  es gestión manual de la academia/admin).
- **Payouts**: `computeSettlement` de ACADEMY incluye los WORKSHOP cuyo
  classId resuelve (via refId → Class → slot) a una academia del actor.
- **UI**: `class-booking-cta` — si el viewer no puede usar cuota
  (no_enrollment o exhausted) y la clase tiene `dropInPrice` + cupo, el CTA
  pasa a "Comprar $X" → POST /checkout/class → redirect a paymentUrl.
  `/checkout/return` mapea WORKSHOP → "Mis clases". Card de clase muestra
  badge de precio suelto cuando aplica.

## Capabilities

### New Capabilities

- `payments/class-dropin`: orden y liquidación de la clase suelta —
  refId `wks_`, Payment WORKSHOP, booking pagado al PAID con manejo de
  cupo agotado en la ventana de pago.
- `academies/dropin-booking`: reserva pagada sin inscripción — coexiste con
  la cuota del plan (quien tiene cuota no paga; quien no, compra), asiento
  liberable por la política de cancelación existente, devolución monetaria
  fuera de scope en v1.

### Modified Capabilities

- `academies/booking-cancellation` (del change class-credit-cancellation):
  cancelar una reserva pagada (enrollmentId=null + paymentId presente)
  libera el cupo pero `refunded=false` siempre — no hay crédito que devolver.

## Impact

- `apps/api/src/payments/domain/order-ref.ts`: `encode/decodeClassRef`.
- `apps/api/src/payments/application/checkout.service.ts` +
  `infrastructure/checkout.controller.ts`: `POST /checkout/class` +
  `GET /checkout/class-quote` (revisión previa — precio + fee + cupo).
- `apps/api/src/payments/application/payment-settlement.service.ts`: rama
  WORKSHOP.
- `apps/api/src/payments/infrastructure/payouts.controller.ts`: WORKSHOP en
  el devengado ACADEMY.
- `apps/api/src/academies/infrastructure/classes.controller.ts`: `book()`
  rechaza la compra implícita — una reserva pagada no nace de `book` sino
  del settle; `detail()` expone si la clase es comprable para el viewer.
- `ClassBooking.paymentId String?` — trazabilidad reserva↔pago (migración).
- Web: `class-booking-cta.tsx` (CTA de compra), `/checkout/return`
  (mapeo WORKSHOP), i18n.
- Tests: spec de checkout service + settlement + classes controller; e2e
  del flujo completo con StubGateway (la pasarela stub ya soporta órdenes
  genéricas — checkout.service.spec muestra el patrón).
