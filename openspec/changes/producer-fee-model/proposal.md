# Proposal - producer-fee-model

## Por qué

El modelo actual cobra un cargo por servicio fijo al **comprador**
(+$500 preventa / +$700 puerta app). Eso fricciona la venta, no escala
con el precio y no es el estándar que queremos comunicar ("publicas tu
precio, el asistente paga exactamente eso"). Además, cada deducción del
payout hoy se deriva de 3 columnas agregadas — no es auditable peso a
peso (nivel BIAN).

Decisión aprobada (omni-dance.md §10, design doc
`docs/superpowers/specs/2026-10-15-producer-fee-model-design.md`):

- La comisión la paga el **productor** como % todo incluido:
  **10% precio de lista / 8% promo** por productor, descontada en la
  liquidación. Desglose: pasarela al costo + fee neto + IVA 19% del fee.
- Modos de cobro derivados de un solo parámetro (`platformFeePct` en
  cadena evento → productor → global): gestionada = all-in; métodos
  propios/pasarela propia = all-in − costo tarjeta (~6,81%/4,81%);
  efectivo en puerta y entrada liberada = 0%.
- Techo explícito: Passline ~15% comisión sola + payout diferido.

## Qué cambia

- `PricingService.quote` ya no suma fee al comprador:
  `total = listPrice − discount`.
- `Payment` persiste la descomposición congelada por orden: `feeMode`,
  `platformFeeRate` (snapshot), `platformFeeNetClp`, `platformFeeVatClp`,
  `gatewayFeeExpected`, `producerNetClp`, `currency`.
- Nuevo `PayoutLine`: cada deducción es una fila tipada enlazada a la
  orden que la generó (auditable peso a peso); soporta netting de
  `OWN_METHOD_*` y ajustes manuales.
- Ledger hash-chain: evento `FEE_ASSESSED` al crear la orden.
- Params nuevos: `platform_fee.managed_allin_pct` (10), `tax.iva_pct`
  (19), `gateway_fee.card_pct` (3.19). Deprecated los `service_fee.*`
  de comprador y los `*FeeClp` de Event/ProducerParams (se ignoran en
  órdenes nuevas; columnas quedan para histórico).
- `platformFeePct` de Event y ProducerParams pasa a ser el override de
  la tasa all-in (antes solo payout agregado).
- Staff door-sale registra `serviceFee: 0` (la venta en puerta por app
  es checkout DOOR → MANAGED).
- UI: checkout sin línea de cargo; paneles admin/productor muestran la
  tasa all-in; detalle de pago expone la descomposición.

## Fuera de alcance

- Slices 2–5 (puerto normalizado + MercadoPago, suscripciones
  genéricas, cuentas de pasarela por actor, métodos propios del
  productor). El modelo de datos y la liquidación ya soportan los
  pagos `OWN_METHOD` que el slice 5 creará.
- `BillingDocument` (factura formal al productor).
