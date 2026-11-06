# Delta: academy-billing

## MODIFIED Requirements

### Requirement: Visibilidad del estado de facturación

`GET /academies/:id/billing` SHALL devolver tier actual, alumnos
activos vs límite, ciclo, próxima facturación, días de gracia
restantes e historial de invoices (del ledger de la suscripción).

Cada invoice SHALL ser navegable al detalle del cobro
(`/academia/cobros/pago/[id]` con `?from=` a la página de suscripción),
que muestra plan (tier/ciclo), método de pago, referencia, número de
operación y estado. `GET /academies/:id/payments/:paymentId` SHALL
adjudicar también los `refId` `platsub_<subId>_*` cuya suscripción
pertenece a la academia (404 fuera de ella, misma política
anti-enumeración).

#### Scenario: Estado visible para el owner

- **GIVEN** academia PRO con 120/150 alumnos activos **WHEN** el owner
  abre `GET /academies/:id/billing` **THEN** ve tier PRO, 120/150,
  fecha de renovación e invoices previos.

#### Scenario: invoice navegable

- **GIVEN** una academia con invoices PLATFORM_SUB
- **WHEN** el owner toca una fila del historial de cobros
- **THEN** abre el detalle del cobro con tier/ciclo, método,
  referencia, transacción y estado, y el back vuelve a suscripción
