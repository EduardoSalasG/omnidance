# dropin-booking — reserva pagada sin inscripción

## Purpose

Un `ClassBooking` con `paymentId` es un asiento comprado directamente:
coexiste con la cuota del plan sin consumirla ni exigir inscripción.

## ADDED Requirements

### Requirement: Asiento pagado no consume cuota

El sistema SHALL excluir los bookings con `paymentId != null` del conteo de
consumo de cuota (`weeklyClasses` y `classCount`).

#### Scenario: compra fuera de cuota

- **GIVEN** un usuario con cuota semanal agotada
- **WHEN** compra una clase suelta y el pago liquida
- **THEN** su reserva queda BOOKED y su cuota sigue mostrando `used=limit`
  (la compra no reduce ni libera crédito)

### Requirement: Cancelación de asiento pagado

El sistema SHALL tratar la cancelación de un asiento pagado como una
cancelación sin devolución: libera el cupo, marca `refunded=false` siempre
(no hay crédito que devolver) y promueve la waitlist. El reembolso
monetario es gestión manual — fuera de scope v1.

#### Scenario: cancelar una clase comprada

- **GIVEN** una reserva BOOKED con `paymentId` (compra WORKSHOP)
- **WHEN** el comprador cancela, dentro o fuera del corte
- **THEN** la reserva queda CANCELLED con `refunded=false` y el asiento se
  libera para la waitlist

### Requirement: Visibilidad de compra

El sistema SHALL exponer `myBookingPaid` en `GET /classes/:id` cuando la
reserva vigente del viewer proviene de una orden WORKSHOP — el copy de
cancelación distingue "pierdes la clase" (cuota) de "la compra no se
reembolsa sola" (pagado).

#### Scenario: detalle con reserva pagada

- **GIVEN** el viewer tiene BOOKED con `paymentId` en la clase
- **WHEN** consulta `GET /classes/:id`
- **THEN** `myBookingPaid: true` y `myBooking: "BOOKED"`
