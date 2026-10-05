# payments/class-dropin Specification

## Purpose
Vender un asiento de `Class` a quien no lo cubre una membresía: la clase
suelta / taller pago (`ClassSeries.dropInPrice`) se cobra como orden
`WORKSHOP` y el asiento se materializa al PAID.

## Requirements

### Requirement: Orden de clase suelta

El sistema SHALL exponer `POST /checkout/class {classId}` que crea una
orden `WORKSHOP` por UNA clase con `dropInPrice` definido en su serie.

#### Scenario: compra válida

- **GIVEN** una clase futura no cancelada con `dropInPrice` y cupo disponible
- **WHEN** un usuario autenticado sin reserva vigente hace
  `POST /checkout/class`
- **THEN** se crea `Payment { orderType: "WORKSHOP", refId:
  "wks_<classId>_<uuid>", quantity: 1, unitListPrice: dropInPrice,
  unitServiceFee, amount: listPrice + fee }`
- **AND** responde `{paymentUrl, paymentId, quote}`

#### Scenario: rechazos

- **WHEN** la clase no existe → 404
- **WHEN** la clase está cancelada, ya inició, o su serie no tiene
  `dropInPrice` → 400
- **WHEN** el cupo está agotado (BOOKED = capacidad efectiva) → 409
- **WHEN** el viewer ya tiene reserva BOOKED/WAITLIST en esa clase → 409

### Requirement: Revisión previa

El sistema SHALL exponer `GET /checkout/class-quote?classId=` que devuelve
`{listPrice, serviceFee, total, spotsLeft, alreadyBooked}` sin crear orden -
el sheet de compra muestra el total real antes de cobrar.

#### Scenario: quote de clase comprable

- **GIVEN** una clase futura con `dropInPrice` y cupo
- **WHEN** el viewer consulta el quote
- **THEN** responde el desglose (lista + cargo = total) y `spotsLeft` actual

#### Scenario: quote de clase no vendible

- **WHEN** la clase está cancelada, ya inició, o su serie no tiene
  `dropInPrice`
- **THEN** responde 400 con el motivo

### Requirement: Liquidación

El sistema SHALL materializar la reserva pagada al confirmarse PAID, dentro
de la misma tx idempotente que marca el Payment.

#### Scenario: PAID con cupo

- **WHEN** el pago WORKSHOP confirma PAID y queda cupo
- **THEN** se crea `ClassBooking { classId, personId, status: "BOOKED",
  paymentId: payment.id, enrollmentId: null }`
- **AND** se emiten los eventos del ledger `STATUS_CONFIRMED` → `SETTLED`
  (una re-notificación sale por `duplicated` sin efectos)
- **AND** `notifySafe payment.paid` al comprador con el nombre de la serie

#### Scenario: PAID sin cupo

- **GIVEN** que el cupo se agotó entre la orden y el pago
- **WHEN** el pago confirma PAID
- **THEN** la reserva se crea como `WAITLIST` (el comprador ya pagó; queda
  en la cola en su orden de llegada) y la venta sigue visible en Cobros

#### Scenario: FAILED

- **WHEN** el pago confirma FAILED
- **THEN** solo se emiten `STATUS_CONFIRMED` + `FAILED` - ninguna reserva
  se crea

### Requirement: Devengado academy

El sistema SHALL incluir las órdenes WORKSHOP en `computeSettlement`
(ACADEMY) y en `GET /payments/by-academy/:id` cuando el `refId` decodifica
a una clase de la academia (`wks_<classId>_` → `Class.slot.academyId`);
el fee es el % global (igual que MEMBERSHIP).

#### Scenario: venta de taller en liquidación

- **GIVEN** un `Payment` WORKSHOP PAID cuyo refId resuelve a una clase de la
  academia
- **WHEN** se calcula el devengado del período
- **THEN** el monto entra al gross/net de la academia junto a MEMBERSHIP

#### Scenario: cobros de la academia

- **WHEN** el owner consulta `GET /payments/by-academy/:id`
- **THEN** las ventas de talleres aparecen junto a las de planes, con el
  nombre de la serie resuelto como contexto
