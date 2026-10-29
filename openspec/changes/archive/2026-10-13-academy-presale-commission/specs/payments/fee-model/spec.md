## ADDED Requirements

### Requirement: Comisión de academia congelada por orden

El sistema SHALL persistir en `Payment` al crear una orden atribuida a
una academia (ver `payments/academy-presale-commission`):

- `soldByAcademyId`: academia vendedora, null si no hay atribución.
- `academyCommissionClp`: `round(unitListPrice × commissionPct) ×
  quantity`; snapshot del acuerdo vigente, nunca se recalcula.

La comisión MUST NOT alterar `producerNetClp` ni la deducción de
plataforma: es un pasivo del productor hacia la academia que se
regulariza fuera del payout (ver la capability referenciada). El
`PaymentEvent` `FEE_ASSESSED` SHALL incluir la comisión congelada cuando
exista.

#### Scenario: orden atribuida al 50%

- **WHEN** se crea una orden PRESALE de $6.000 atribuida a una academia
  con acuerdo al 50%
- **THEN** `academyCommissionClp=3000`, `producerNetClp` queda igual que
  una orden sin atribuir, y `FEE_ASSESSED` incluye el monto
