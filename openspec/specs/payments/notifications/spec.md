# payments/notifications Specification

## Purpose
TBD - created by archiving change payment-notifications. Update Purpose after archive.

## Requirements

### Requirement: Respaldo por email al pagador en PAID one-off

Al liquidar una orden one-off (TICKET, SERIES_PASS, SOCIAL_PASS,
MEMBERSHIP, CLASS/WORKSHOP, PRIVATE_CLASS) la plataforma debe enviar
al email del pagador un resguardo con nº de transacción, producto,
monto, moneda, medio de pago, fecha y referencia al evento/academia.
Exactamente una vez por Payment (idempotente ante re-notificación o
polling).

#### Scenario: Compra de ticket pagada

- **WHEN** un Payment TICKET transiciona a PAID por webhook o polling
- **THEN** el pagador recibe un mail con el resguardo completo y el
  admin recibe una Notification in-app con los datos del pago.

### Requirement: Respaldo por email al owner en PAID PLATFORM_SUB

Al liquidar un invoice PLATFORM_SUB el owner de la academia recibe
un mail con plan, ciclo, monto y nº de invoice.

#### Scenario: Invoice de suscripción cobrada

- **WHEN** un Payment PLATFORM_SUB transiciona a PAID
- **THEN** el owner recibe el mail de resguardo del cobro SaaS.

### Requirement: Notification admin por pago confirmado

Cada transición a PAID registra una Notification visible para el
rol ADMIN con tipo, orderType, monto, medio y pagador.

#### Scenario: Pago liquidado notifica al admin

- **WHEN** cualquier Payment transiciona a PAID
- **THEN** existe una Notification admin con los datos de la orden.
