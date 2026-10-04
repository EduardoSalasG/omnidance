# Diseño — checkout de clase suelta (WORKSHOP)

## Decisión central

Un taller pago y una "clase suelta" son el mismo mecanismo: **vender un
asiento de `Class` a quien no lo cubre una membresía**. `ClassSeries.dropInPrice`
ya modela el precio y ya se edita/muestra; lo único que falta es la orden de
pago y su liquidación. No hay modelo nuevo — se reutiliza `Class`,
`ClassBooking`, `Attendance`, capacity y waitlist.

## Modelo de datos (migración)

```prisma
model ClassBooking {
  // …
  paymentId String? // NUEVO: orden WORKSHOP que pagó este asiento
}
```

Un booking con `paymentId != null` es un **asiento pagado**: no consume
cuota de ningún plan (la conteo de `resolveQuota` excluye `paymentId != null`)
y no exige inscripción.

## RefId

`wks_<classId>_<uuid>` — igual que `mem_`/`sp_`: el contexto viaja en el
refId porque `Payment` no tiene columna para la clase. Encode/decode en
`order-ref.ts` siguiendo el patrón existente.

## API

- `GET /checkout/class-quote?classId=` → revisión previa:
  `{listPrice, serviceFee, total, spotsLeft, alreadyBooked}` — el sheet de
  compra declara el total real antes de ir a la pasarela.
- `POST /checkout/class {classId}` → `{paymentUrl, paymentId, quote}`:
  - 404 clase inexistente; 400 clase cancelada/pasada o serie sin
    `dropInPrice`; 409 cupo agotado (re-check de `BOOKED` vs capacidad
    efectiva) o el viewer ya tiene reserva consumidora (BOOKED/WAITLIST).
  - `Payment` WORKSHOP: `quantity=1`, `unitListPrice=dropInPrice`,
    `unitServiceFee=service_fee.membership_clp` (mismo param; una orden de
    academia cobra el mismo cargo), `amount=list+fee`, `channel="PRESALE"`.
- `PaymentSettlementService.settle` → rama `WORKSHOP` (`settleClassDropin`):
  claim atómico →PAID + eventos del ledger (mismo `emitSettleEvents`); en la
  tx crea `ClassBooking { classId, personId, paymentId }` con `BOOKED` si
  queda cupo al liquidar, o `WAITLIST` si se llenó entre la orden y el pago
  (el pago ya ocurrió — la academia gestiona; el usuario queda primero en la
  cola). `notifySafe payment.paid` con el nombre de la serie.
- `resolveQuota`: el conteo de consumo añade `paymentId: null` al filtro —
  un asiento pagado nunca descuenta cuota.
- `GET /classes/:id` detail: ya expone `series.dropInPrice` y `myBooking`;
  añade `myBookingPaid` (bool) para el copy de cancelación.
- `DELETE /classes/:id/book`: asiento pagado → `refunded=false` siempre
  (no hay crédito que devolver; el reembolso monetario es gestión manual).
- `GET /payments/by-academy/:id`: incluye WORKSHOP (decode `wks_` →
  classId ∈ clases de la academia). `withContextNames` resuelve nombre de
  serie para WORKSHOP.
- `computeSettlement` (payouts): ACADEMY devenga WORKSHOP via refId →
  Class → slot.academyId, % global (igual que MEMBERSHIP).

## UI

- `class-booking-cta`: nueva rama — viewer sin cuota usable
  (`!enrolled || creditsLeft===0`) + `dropInPrice` + cupo → CTA "Comprar
  clase suelta"; el sheet muestra el quote (list + fee = total) y confirma
  → POST → redirect `paymentUrl`. Quien tiene cuota nunca ve el precio como
  barrera (el book por cuota sigue primero). Copy de cancelación para
  asiento pagado: "liberas el cupo; la compra no se reembolsa sola".
- `/checkout/return`: `orderType WORKSHOP` → CTA "Ir a Mis clases".
- `class-card` / ficha: badge de precio suelto ya existe (`dropInPrice`);
  `t("dropIn")` ya está en i18n.

## Riesgos

- **Cupo en la ventana compra→pago**: se re-chequea al settle; el pagante
  que pierde la carrera queda en WAITLIST y se notifica — la academia ve la
  venta en Cobros y decide (reembolso manual o sobrecupo). Caso raro.
- **Doble compra**: `@@unique([classId, personId])` en ClassBooking hace que
  un segundo settle por la misma clase choque — el checkout lo previene
  (409 si ya hay reserva consumidora) y el settle hace upsert defensivo.
- **pagos legacy**: ninguno — WORKSHOP no existía antes; no hay historia.
