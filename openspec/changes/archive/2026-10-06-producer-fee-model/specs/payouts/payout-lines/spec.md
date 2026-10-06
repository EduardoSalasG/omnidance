# Delta spec - payouts/payout-lines

## ADDED Requirements

### Requirement: Liquidación por líneas auditable (PayoutLine)

Al generar un payout el sistema SHALL crear una `PayoutLine` por cada
deducción de cada pago del período, enlazada por `paymentId`, con tipos
`PLATFORM_FEE_NET`, `PLATFORM_FEE_VAT`, `GATEWAY_FEE_PASSTHROUGH`,
`OWN_METHOD_FEE_NET`, `OWN_METHOD_FEE_VAT`, `MANUAL_ADJUSTMENT`.
`net = gross − Σ lines`. Las columnas `platformFee`/`gatewayFee` del
`Payout` quedan como totales denormalizados de sus familias de líneas.
`lines[]` de la respuesta proviene de la tabla.

#### Scenario: Pago gestionado descompone sus tres líneas

- **WHEN** el payout incluye un Payment MANAGED PAID de $6.000
  (net 344, iva 65, gatewayFeeClp real 189)
- **THEN** existen `PLATFORM_FEE_NET` 344, `PLATFORM_FEE_VAT` 65 y
  `GATEWAY_FEE_PASSTHROUGH` 189 enlazadas a ese paymentId
- **AND** `net = gross − 598`

#### Scenario: Passthrough usa el costo real, no el esperado

- **WHEN** la pasarela reportó `gatewayFeeClp=189` aunque
  `gatewayFeeExpected=191`
- **THEN** la línea `GATEWAY_FEE_PASSTHROUGH` usa 189

#### Scenario: Netting de métodos propios

- **WHEN** el productor vendió $50.000 por métodos propios (OWN_METHOD,
  rate derivado) en el período
- **THEN** el payout gestionado del período descuenta las líneas
  `OWN_METHOD_FEE_NET`/`OWN_METHOD_FEE_VAT` correspondientes
- **AND** cada línea rastrea al pago own-method que la generó

#### Scenario: Pagos legacy sin descomposición

- **WHEN** el período incluye un Payment con `feeMode=null` (pre-deploy)
- **THEN** se genera `GATEWAY_FEE_PASSTHROUGH = Payment.fee` (costo real)
- **AND** el neto reproduce la fórmula legacy `gross − Σ fee`

#### Scenario: Academia conserva su modelo

- **WHEN** el payout es ACADEMY
- **THEN** solo líneas `GATEWAY_FEE_PASSTHROUGH` (fee real por pago o
  `gross × gateway_fee.card_pct` cuando no hay dato real) — sin
  `PLATFORM_FEE_*`

#### Scenario: Órdenes FREE no generan líneas

- **WHEN** el período incluye pagos `feeMode=FREE`
- **THEN** aportan a `gross` ($0) y cero líneas

#### Scenario: Ajuste manual

- **WHEN** admin corrige una liquidación
- **THEN** se crea `MANUAL_ADJUSTMENT` con `paymentId=null` y `meta.reason`
