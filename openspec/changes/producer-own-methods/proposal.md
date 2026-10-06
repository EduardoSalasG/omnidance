# Producer own methods (métodos de pago propios del productor)

## Problema

El modelo de fees (`producer-fee-model`) contempla `feeMode
OWN_METHOD` — la venta se cobra por medios del productor
(transferencia, link, efectivo coordinado) y la plataforma devenga su
comisión (`all-in − card%`) neteándola en el payout como líneas
`OWN_METHOD_*`. Pero hoy no existe camino para que un comprador elija
esos medios en tickets/series-pass: el checkout solo ofrece pasarela.
Las academias ya tienen su patrón (medios BYO + cola de comprobantes);
el lado productor/social no.

## Propuesta

- **`ProducerPaymentMethod`**: espejo de `AcademyPaymentMethod`
  (`producerId`, `type` TRANSFER|PAYMENT_LINK|CASH, `label`, `details`
  Json, `order`, `active`). CRUD del productor en
  `/producer/payment-methods`; lectura de métodos activos por evento
  en `GET /events/:id/payment-methods` (los expone el checkout).
- **Checkout con método propio**: `purchaseTicket` /
  `purchaseSeriesPass` aceptan `methodId` opcional. Con método válido
  del productor del evento/serie → `Payment` PENDING con
  `gateway:"MANUAL"` + `feeMode:"OWN_METHOD"` (desglose congelado
  `ownMethodBreakdown`), sin llamar a la pasarela ni a cuentas
  propias. La respuesta devuelve las instrucciones del método
  (snapshot `{type,label,details}`) en vez de `paymentUrl`.
- **`TicketClaim`**: comprobante sobre una orden concreta (a
  diferencia del claim de academia, que crea el pago al aprobarse, el
  de ticket adjunta evidencia a un `Payment` PENDING existente):
  `paymentId`, `personId` (comprador), `producerId`, `receiptKey`,
  `methodType`/`methodLabel` (snapshot), `status`, `note`, auditoría
  de revisión. Solo el dueño de la orden puede subir comprobante y
  solo sobre órdenes `MANUAL` PENDING.
- **Cola del productor**: `GET /producer/claims?status=`, receipt por
  endpoint autenticado (comprador dueño o el productor),
  `POST /producer/claims/:id/approve` (flip atómico PENDING→APPROVED +
  `settle(payment,"PAID")` — mismo camino que el webhook: tickets,
  mesa, redención de código, ledger, notificaciones) y
  `POST /producer/claims/:id/reject {note}` (notifica al comprador; la
  orden sigue PENDING → puede subir otro comprobante).
- **Front**: selector de medio en el checkout de evento/serie cuando
  el productor tiene métodos activos → instrucciones + subida de
  comprobante; sección "Métodos propios" en `/productor/parametros`
  (CRUD); página `/productor/comprobantes` (cola + aprobar/rechazar +
  ver comprobante) con card en el hub.

## Out of scope

- Reembolsos/anulación de órdenes ya aprobadas.
- Claims de series-pass comparten el mismo `TicketClaim` (la orden
  decide qué emite el settle).
- Métodos propios para academias (ya existe `academy-payment-claims`).
- Conciliación bancaria automática (revisión es humana, por diseño).
