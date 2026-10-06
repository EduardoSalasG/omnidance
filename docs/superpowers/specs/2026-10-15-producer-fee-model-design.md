# Design: producer-fee-model — comisión todo incluido al productor + trazabilidad BIAN

Fecha: 2026-10-15 · Estado: aprobado por usuario · Slice 1 de 5 del rediseño de pagos

## Decisión de producto (aprobada)

- El **comprador paga exactamente el precio de lista** (menos descuento). El cargo por servicio al asistente desaparece de todos los canales.
- La plataforma cobra al **productor** un % todo incluido sobre la venta, descontado en liquidación:
  - **10% precio de lista** (default global), **8% promo** negociable por productor.
  - `platformFeePct` resuelve en cadena: `Event.platformFeePct` → `ProducerParams.platformFeePct` → param `platform_fee.managed_allin_pct` (10).
- Desglose interno del %: **pasarela al costo** (real por medio) + **fee neto** + **IVA 19% sobre el fee neto**.
- Modos de cobro derivados de un solo parámetro:
  - `MANAGED` (nuestra pasarela): all-in completo.
  - `OWN_METHOD`/`OWN_GATEWAY` (cobran por su lado): `all-in − gateway card %` → 6,81% / 4,81%. Devengado y neteado contra payouts gestionados. *(los pagos OWN_METHOD llegan en slice 5; el modelo de datos y la liquidación ya los soportan)*
  - `FREE`: órdenes $0 (entrada liberada, cupón 100%) y registro de puerta en efectivo → 0%.
- IVA: `tax.iva_pct` = 19, param global.
- Academias: sin cambio de economía (SaaS) — sus órdenes persisten descomposición con `feeMode=ACADEMY` para reporting uniforme.

## Cambios de datos (schema)

```prisma
model Payment {
  // ... existentes ...
  feeMode            String?  // MANAGED | OWN_METHOD | OWN_GATEWAY | FREE | ACADEMY
  platformFeeRate    Float?   // % all-in aplicado (snapshot - congela la tasa)
  platformFeeNetClp  Int?     // fee plataforma neto devengado (CLP; currency cuando llegue slice 2)
  platformFeeVatClp  Int?     // IVA sobre el neto
  gatewayFeeExpected Int?     // esperado al crear (reconcile vs gatewayFeeClp real)
  producerNetClp     Int?     // amount − deducción total (lo que recibe el actor)
  currency           String   @default("CLP")
}

model PayoutLine {
  id        String   @id @default(cuid())
  payout    Payout   @relation(fields: [payoutId], references: [id])
  payoutId  String
  payment   Payment? @relation(fields: [paymentId], references: [id])
  paymentId String?  // null en ajustes manuales
  type      String   // PLATFORM_FEE_NET | PLATFORM_FEE_VAT |
                     // GATEWAY_FEE_PASSTHROUGH | OWN_METHOD_FEE_NET |
                     // OWN_METHOD_FEE_VAT | MANUAL_ADJUSTMENT
  amount    Int      // deducción (positivo) o abono (negativo)
  meta      Json?    // {rate, gatewayFeeReal, reason...}
  createdAt DateTime @default(now())
}
```

`Payout.gross/platformFee/gatewayFee/net` quedan como **totales denormalizados**; `PayoutLine` es la verdad por fila. Migración manual `migrate deploy`.

## Cambios de dominio

### `PricingService.quote`

`total = listPrice − discount` (clamped ≥0). `serviceFee` sale del contrato — queda `Quote{listPrice, discount, total}`. Todos los consumers se actualizan.

### Checkout (`purchaseTicket`, `discountQuote`, series-pass)

- `amount = total` (sin sumar fee). `unitServiceFee = 0` (columna queda para rows legacy).
- Al crear la orden se resuelve y persiste la descomposición:
  - `total === 0` → `feeMode: FREE`, todos los fees 0, `producerNetClp: 0`, `gateway: "FREE"` (comportamiento ya implementado).
  - `total > 0` → `feeMode: MANAGED`, `platformFeeRate` resuelto por cadena, y:
    - `deduction = round(amount × rate / 100)`
    - `gatewayFeeExpected = round(amount × gatewayFee.card_pct / 100)`
    - `ourGross = deduction − gatewayFeeExpected` → `platformFeeNetClp = round(ourGross / (1 + iva))`, `platformFeeVatClp = ourGross − net`
    - `producerNetClp = amount − deduction`
- Evento `FEE_ASSESSED` en `PaymentEvent` dentro de la tx de creación (payload: feeMode, rate, net, vat, expected, producerNet). Requiere pasar el tx client o emitir post-create con `actor: "checkout"`.
- `Event.platformFeePct` y `ProducerParams.platformFeePct` pasan a ser el override de la tasa all-in (hoy `platformFeePct` en payout solo; `Event.serviceFeeClp` y los `*FeeClp` de ProducerParams quedan **deprecated** — se ignoran en órdenes nuevas).
- Órdenes de academia (MEMBERSHIP/WORKSHOP/PRIVATE): `feeMode: ACADEMY`, platformFee 0 (monetiza SaaS), `producerNetClp = amount`, gatewayFeeExpected por `gateway_fee.card_pct`.

### Registro de puerta (staff `createDoorSale`)

- CASH/APP staff-registered: sin pago por plataforma → `serviceFee: 0` en el Ticket (se ignora la cadena `doorCashFeeClp`/`doorAppFeeClp`/`service_fee.door_*` — params y campos deprecated).
- No crea `Payment` (hoy tampoco) → no devenga fee. La venta en puerta por **app** que sí paga por checkout es `purchaseTicket` canal DOOR → `MANAGED`.

### Payouts (`payouts.controller`)

- **Nuevo modelo**: al generar, se crean `PayoutLine` por pago y tipo.
  - `MANAGED` producer/venue: `PLATFORM_FEE_NET` (−net), `PLATFORM_FEE_VAT` (−vat), `GATEWAY_FEE_PASSTHROUGH` (−`gatewayFeeClp` real reportado).
  - `OWN_METHOD` (futuro): `OWN_METHOD_FEE_NET` + `OWN_METHOD_FEE_VAT` — deducciones neteadas en el payout gestionado del período.
  - `FREE`: sin líneas. `ACADEMY`: `GATEWAY_FEE_PASSTHROUGH` por pago (mismo resultado que hoy).
  - **Legacy** (`feeMode null`): `GATEWAY_FEE_PASSTHROUGH` = `Payment.fee` (costo real persistido) — reproduce la fórmula vieja `gross − Σfee − platformFeePct(≈0)` sin backfill.
  - `MANUAL_ADJUSTMENT` disponible para correcciones admin (paymentId null).
- `net = gross − Σ lines`. `payout.platformFee = Σ PLATFORM_*`, `payout.gatewayFee = Σ GATEWAY_*` (denormalizado).
- Response `lines[]` ahora viene de la tabla (per-payment), no derivada de 3 columnas.
- `Event.platformFeePct`/`ProducerParams.platformFeePct` ya no se leen en payout — la tasa quedó congelada por orden (`platformFeeRate`).

### Params

- Nuevo `platform_fee.managed_allin_pct` = 10; `tax.iva_pct` = 19; `gateway_fee.card_pct` = 3.19 (tasa esperada tarjeta — la usan `gatewayFeeExpected` y la derivación OWN_METHOD).
- Deprecated (quedan en DB/whitelist, dejan de leerse): `service_fee.presale_clp`, `service_fee.door_app_clp`, `service_fee.door_cash_clp`, `service_fee.series_pass_clp`, `platform_fee.default_pct`, `gateway_fee.academy_passthrough_pct` (este último se reemplaza por `gateway_fee.card_pct` en la generación de líneas academy — el valor es el mismo 3.19).
- Seed: agrega los nuevos params con `update: {}` (no pisa editados); `ProducerParams.platformFeePct` pasa a significar "tasa all-in del productor" — los valores actuales (null/0) siguen siendo válidos como override/promo.

## Contratos y UI

- `Quote`/responses de checkout: `serviceFee` sale (o queda 0 por compat — decisión: **sale**, contrato limpio; el front deja de mostrar la línea "cargo por servicio").
- Checkout UI: el total mostrado = precio exacto. Quitar línea de cargo.
- `/admin/parametros` + `/productor/parametros`: los campos `serviceFeeClp/doorAppFeeClp/doorCashFeeClp` salen; `platformFeePct` queda como "comisión todo incluido (%)" — misma cadena evento→productor→global.
- `Event.platformFeePct` editable por admin en el form (override de la tasa; ya existe el campo en DTO/schema).
- `Payment.feeMode`/`platformFeeRate`/desglose visibles en `GET /payments/:id` (detalle admin/auditoría) y en `by-event` (el productor ve su comisión por venta).

## Fuera de alcance (slices siguientes)

- 2 — normalización del puerto de órdenes (`GatewayConfirmation`), webhook por proveedor, `Event.currency`, adaptador MercadoPago.
- 3 — puerto de suscripciones genérico (tipos Flow fuera del contrato).
- 4 — `GatewayAccount` cifrado por actor + resolución de credenciales (habilita `OWN_GATEWAY`).
- 5 — `ProducerPaymentMethod` + claims espejo de academias (origina los pagos `OWN_METHOD` que este modelo ya sabe liquidar).
- `BillingDocument` (factura formal al productor) — posterior; la base ya queda en `PayoutLine`.

## Riesgos y migración

- **Órdenes viejas**: `feeMode null` → fórmula legacy en payout; no hay backfill destructivo.
- **`Ticket.serviceFee`/`Payment.unitServiceFee`** quedan para histórico; nuevos = 0.
- **Revenue**: el neto por ticket queda ~igual (ver unit economics en omni-dance.md); el cambio es de estructura.
- **Pendientes**: `Payment` PENDING creados pre-deploy → al liquidarse quedan con desglose null → caen en rama legacy del payout (correcto: el comprador ya pagó con fee viejo, el productor debe recibir su lista completa — la línea GATEWAY_PASSTHROUGH = Payment.fee reproduce exactamente eso).
- **IVA del passthrough**: el costo de pasarela no lleva IVA nuestro (es costo ajeno al costo); solo `platformFee*` devenga `PLATFORM_FEE_VAT`.

## Tests (TDD)

- `pricing.service.spec`: quote sin fee (total = lista − descuento, clamp 0).
- `checkout.service.spec`: descomposición MANAGED (rate 10/8, net+iva+expected+producerNet), FREE $0 (todo 0), FEE_ASSESSED en el chain, override evento→productor→global, discount deja total>0 con desglose correcto, ACADEMY en órdenes de academia.
- `payouts` spec: líneas por pago por tipo, net = gross − Σlines, netting OWN_METHOD, legacy fallback, denormalizados coherentes.
- `checkins.service.spec`: door sale con serviceFee 0.
