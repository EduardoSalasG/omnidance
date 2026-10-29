# checkins/door-sale; moneda del ticket de puerta

## ADDED Requirements

### Requirement: Moneda de la venta de puerta

El ticket emitido en una venta de puerta SHALL persistir
`currency = event.currency` (nunca el default CLP del schema cuando el
evento declara otra moneda).

#### Scenario: venta de puerta en evento USD

- **GIVEN** un evento con `currency="USD"`
- **WHEN** staff registra una venta de puerta CASH o APP
- **THEN** el `Ticket` queda con `currency="USD"` y los montos en la
  unidad menor de USD
