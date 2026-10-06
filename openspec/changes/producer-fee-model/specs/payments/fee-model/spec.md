# Delta spec - payments/fee-model

## ADDED Requirements

### Requirement: El comprador paga exactamente el precio de lista

El sistema SHALL cobrar al comprador `total = listPrice − discount`
(clamped a ≥0) sin sumar cargo por servicio en ningún canal
(`PRESALE`, `DOOR`, `SERIES_PASS`, registro de puerta staff). El total
de la orden coincide con el `Payment.amount` y con lo que la pasarela
cobra.

#### Scenario: Preventa sin cargo

- **WHEN** un ticket con `presalePrice = 5300` se compra sin descuento
- **THEN** `quote.total = 5300` y `Payment.amount = 5300`
- **AND** `unitServiceFee = 0`

#### Scenario: Descuento parcial

- **WHEN** un ticket de $5.300 aplica un cupón 20%
- **THEN** `quote.total = 4240`

#### Scenario: Registro de puerta staff

- **WHEN** staff registra una venta de puerta (CASH o APP)
- **THEN** el `Ticket` se crea con `serviceFee = 0`

### Requirement: Descomposición de fee congelada por orden

El sistema SHALL persistir en `Payment` al crear la orden:

- `feeMode`: `MANAGED` (tickets/pases por pasarela nuestra),
  `ACADEMY` (órdenes de academia — monetiza SaaS), `FREE` (total $0).
- `platformFeeRate`: % todo incluido aplicado, resuelto
  `Event.platformFeePct` → `ProducerParams.platformFeePct` →
  `platform_fee.managed_allin_pct` (default 10). Snapshot — nunca se
  recalcula.
- `platformFeeNetClp` + `platformFeeVatClp`:
  `round((deduction − gatewayExpected) / (1 + tax.iva_pct/100))` y su
  complemento IVA.
- `gatewayFeeExpected`: `round(amount × gateway_fee.card_pct / 100)`.
- `producerNetClp`: `amount − deduction`.
- `currency`: `CLP` por ahora.

Y SHALL emitir `FEE_ASSESSED` en el `PaymentEvent` hash-chain con la
descomposición.

#### Scenario: Orden gestionada a tasa de lista

- **WHEN** se crea una orden de $6.000 con rate 10% y card 3.19%
- **THEN** `feeMode=MANAGED`, `platformFeeRate=10`,
  `gatewayFeeExpected=191`, `platformFeeNetClp≈344`,
  `platformFeeVatClp≈65`, `producerNetClp=5400`
- **AND** existe `FEE_ASSESSED` con esos valores en la cadena

#### Scenario: Promo del productor

- **WHEN** el productor tiene `ProducerParams.platformFeePct = 8`
- **THEN** la orden de $6.000 persiste `platformFeeRate=8`,
  `producerNetClp=5520`

#### Scenario: Override del evento gana

- **WHEN** el evento tiene `platformFeePct=5` y su productor 8
- **THEN** `platformFeeRate=5`

#### Scenario: Orden $0

- **WHEN** el total es $0
- **THEN** `feeMode=FREE`, `gateway="FREE"` (mismo settle inmediato del
  spec `event-presale-cutoff`), todos los campos de fee en 0/null y
  `producerNetClp=0`

#### Scenario: Orden de academia

- **WHEN** la orden es MEMBERSHIP/WORKSHOP/PRIVATE
- **THEN** `feeMode=ACADEMY`, `platformFeeNetClp=0`,
  `platformFeeVatClp=0`, `producerNetClp=amount`,
  `gatewayFeeExpected` por `gateway_fee.card_pct`

#### Scenario: Orden PENDING heredada

- **WHEN** un Payment creado antes del deploy se liquida
- **THEN** sus campos de descomposición quedan null y la liquidación lo
  trata como legacy (ver payouts/payout-lines)


