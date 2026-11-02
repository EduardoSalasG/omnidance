# Delta; payments/subscriptions

## ADDED Requirements

### Requirement: `invoices[].amount` normalizado a número

El adaptador SHALL entregar `SubscriptionInvoice.amount` como `number`
en unidad mayor de la moneda, aunque el proveedor lo reporte como
string (Flow devuelve `"25000.0000"`). La coerción vive en la
normalización del adaptador (frontera), nunca en los consumers del
reconcile.

#### Scenario: Invoice Flow con amount string

- **WHEN** `subscription/get` devuelve una invoice con
  `amount: "25000.0000"` (string, formato wire de Flow)
- **THEN** `RemoteSubscription.invoices[].amount` es `25000` (number)
  y el reconcile puede persistirlo en `Payment.amount` (Int)

#### Scenario: Invoice sin amount válido

- **WHEN** la invoice no reporta amount o no es coercible
- **THEN** `amount` es `0` y el consumer aplica su fallback de precio
  del plan (comportamiento previo conservado)
