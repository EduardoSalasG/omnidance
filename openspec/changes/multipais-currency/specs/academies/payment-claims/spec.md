# academies/payment-claims — moneda del claim

## ADDED Requirements

### Requirement: Moneda del comprobante

`PaymentClaim` SHALL persistir `currency` (ISO-4217) como snapshot de
la moneda de la academia al momento del claim; `amount` se interpreta
en esa moneda. El alumno SHALL declarar montos en la moneda de la
academia y la UI SHALL rotularla explícitamente cuando no sea CLP.

#### Scenario: claim en moneda local

- **GIVEN** una academia cuya moneda es MXN
- **WHEN** el alumno declara un pago de 800
- **THEN** el claim persiste `amount=800, currency="MXN"` y el owner lo
  ve rotulado en MXN en la cola de validación

#### Scenario: academia CL sin cambios

- **WHEN** una academia de Chile recibe un claim
- **THEN** `currency="CLP"` y el comportamiento es idéntico al actual
