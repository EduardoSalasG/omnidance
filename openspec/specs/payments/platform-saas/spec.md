# payments/platform-saas Specification

## Purpose
TBD - created by archiving change academy-saas-billing. Update Purpose after archive.

## Requirements

### Requirement: Cargo de servicio al comprador

El `service_fee` plano SHALL aplicar únicamente a órdenes de eventos
(TICKET, DOOR, SERIES_PASS). Las órdenes de academia (MEMBERSHIP,
WORKSHOP, PRIVATE) SHALL cobrar el precio del producto sin cargo de
servicio - el posicionamiento es "la academia vende sin comisiones, el
alumno paga solo lo que la academia fija".

#### Scenario: Compra de membresía sin fee

- **GIVEN** plan de $30.000 **WHEN** el alumno cotiza/compra **THEN**
  `serviceFee = 0`, `total = $30.000`, y el breakdown no muestra línea
  de cargo por servicio.

### Requirement: Costo de pasarela en payout de academia

El costo Flow (~3.19%, param `gateway_fee.academy_passthrough_pct`)
SHALL descontarse de la liquidación de la academia como línea
explícita `GATEWAY_FEE_PASSTHROUGH` - separada del net, nunca
escondida. El payout del productor de eventos SHALL mantener su
`platformFeePct` como comisión de plataforma.

#### Scenario: Liquidación transparente

- **GIVEN** academia con $100.000 de ventas del período **THEN** su
  payout muestra bruto $100.000 − pasarela ~$3.190 = neto $96.810.

### Requirement: Suscripciones de la plataforma

Las suscripciones de la plataforma misma (academia SaaS, Producer Pro)
SHALL usar el mismo motor `Subscription`/Flow, ledger hash-chain y
notificaciones de mora que las membresías de alumnos - incluyendo
`RENEWAL_SETTLED`/`RENEWAL_FAILED` y la dedup del aviso.

#### Scenario: Misma evidencia de cobro

- **GIVEN** la suscripción de una academia **WHEN** Flow renueva
  **THEN** el `Payment`/`PaymentEvent` de la orden queda con el mismo
  hash-chain que una membresía de alumno.
