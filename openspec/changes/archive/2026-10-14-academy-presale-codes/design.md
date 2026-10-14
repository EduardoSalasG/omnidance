# Design — academy-presale-codes

## Flujo

```
productor crea acuerdo (commissionPct, maxTickets?) → academia acepta
academia vende entrada en efectivo → POST /academy-deals/:id/codes
  → DiscountCode { type: ACADEMY_PRESALE, percentOff: 100, maxUses: 1,
                   eventId|seriesId = scope del acuerdo,
                   academySaleAgreementId }
academia entrega el código al comprador
comprador checkout con código → orderTotal $0 → gateway FREE →
  settle inmediato (ticket + DiscountRedemption + Payment.discountCodeId
  + soldByAcademyId + academyCommissionClp congelado)
deuda del acuerdo:
  link-sales (soldByAcademyId & sin código)  → productor debe comisión
  code-sales (código del acuerdo)            → academia debe lista−comisión
  saldo neto; settlement marca el pago de quien debe (amountDue firmado)
```

## Código legible

`SLUG-EVENTO-XXXX` — SLUG = primeros 6 chars alfanuméricos del nombre de
la academia en mayúsculas; EVENTO = `DDMMM` del startsAt del evento
(`15NOV`); XXXX = 4 chars aleatorios del alfabeto sin ambiguos
(sin 0/O/1/I/L). Acuerdos de serie (sin fecha única): `SLUG-XXXX`.
Retry con sufijo nuevo ante colisión del unique.

## Cupo

`maxTickets` del acuerdo limita los **códigos emitidos**
(count DiscountCode por agreementId). Además cada código es de un uso
(`maxUses=1`) y la redención queda atada a la orden (`paymentId` en
`DiscountRedemption`, `Payment.discountCodeId`). El cupo link-canal sigue
computando tickets PAID atribuidos — comparten el mismo techo: al emitir
se verifica `códigos emitidos + tickets PAID por link < maxTickets`.

## Deuda neta (doble dirección)

`debtFor` se extiende:

- `owedToAcademyClp` = Σ `academyCommissionClp` de órdenes PAID con
  `soldByAcademyId` **sin** código del acuerdo (el comprador pagó por la
  app — el productor cobró todo).
- `owedToProducerClp` = Σ (`unitListPrice − academyCommissionClp`) ×
  quantity de órdenes PAID cuyo `discountCodeId` es un código del acuerdo
  (la academia cobró el efectivo completo).
- `settledClp` = Σ `AcademySaleSettlement.amountDue` (firmado).
- `pendingClp` (firmado) = `owedToAcademy − owedToProducer − settled`:
  positivo = el productor paga; negativo = la academia paga. `markPaid`
  persiste el pendiente firmado y queda permitido a ambos lados? No —
  decisión previa: **el productor marca pagado** (unilateral). Si el
  saldo es a favor del productor, igual lo marca él cuando la academia le
  transfirió.

## Medio en la vista de ventas

`Payment.methodLabel` (nuevo, nullable): snapshot al crear la orden —
`ownMethod.label` para MANUAL; `null` en el resto (la UI cae a
"Preventa {academia}" cuando `soldByAcademyId` + `discountCodeId`, o a
`gatewayMedia`/"App"). La proyección `withContextNames` agrega
`personName` (hecho) y `soldByAcademyName` (lookup por soldByAcademyId).

## Bordes

- Acuerdo DISABLED: sus códigos dejan de redimirse (check en checkout),
  los ya redimidos quedan.
- Un código `ACADEMY_PRESALE` solo lo emite el servicio — no se crea por
  el endpoint genérico de códigos (type cerrado en validateCreateCode:
  se agrega al enum pero el controller de descuentos lo rechaza para
  creación manual? — se permite, es compatible; el generator es la vía
  recomendada).
- `percentOff: 100` calza la regla existente 1..100 — no requiere
  relajar la validación de descuento.
