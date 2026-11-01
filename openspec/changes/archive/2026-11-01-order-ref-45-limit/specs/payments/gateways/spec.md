# Delta; payments/gateways

## ADDED Requirements

### Requirement: commerceOrder dentro del límite de Flow

`Payment.refId` se envía como `commerceOrder` en `payment/create`.
Flow rechaza referencias sobre 45 caracteres; todo formato de refId
de órdenes one-off (TICKET, SERIES_PASS, MEMBERSHIP, WORKSHOP,
PRIVATE) debe caber en 45 caracteres con ids cuid (25) y el encoder
debe fallar localmente si un formato lo excede. `platsub_*` queda
exento porque nunca pasa por `payment/create`.

#### Scenario: Ref de ticket con ids cuid

- **WHEN** se compra un ticket para un evento con id cuid
- **THEN** el `refId` generado tiene 45 caracteres o menos y decodifica
  el `eventId`; el `discountCodeId` se lee de la columna `Payment`,
  no del ref.

#### Scenario: Ref de series pass con mes

- **WHEN** se compra un pase de serie con `month` `YYYY-MM` e id cuid
- **THEN** el `refId` tiene 45 caracteres o menos y decodifica
  `seriesId` y `month`.

#### Scenario: Formato que excede el límite

- **WHEN** un encoder genera un `refId` sobre 45 caracteres
- **THEN** la operación falla con error local explícito antes de llamar
  a la pasarela.

#### Scenario: Compatibilidad con refs legacy

- **WHEN** el settle o un reporte decodifica un `refId` de ticket del
  formato anterior `tkt_<eventId>_<codeId>_<uuid>`
- **THEN** el decode devuelve `eventId` y `codeId` igual que antes.
