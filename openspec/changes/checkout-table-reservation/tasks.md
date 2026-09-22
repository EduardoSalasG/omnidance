# Tasks — checkout-table-reservation

- [x] Schema: `Event.tablesTotal Int?`, `Payment.tablePartySize Int?` + `db push` + regen client
- [x] API events: `tablesTotal` en CreateEventDto/UpdateEventDto (null limpia), detail expone `tablesTotal`+`tablesLeft`
- [x] API checkout: `tablePartySize` en DTO (1–12) + persistir en Payment
- [x] API webhook: crear TableReservation REQUESTED al PAID (dedup activa) + notificación al productor
- [x] API reservations: `partySize` opcional en PATCH manage
- [x] Web checkout: sección mesa (oculta/sin-stock/Sí-No+stepper+disclaimer) + success menciona reserva
- [x] Web productor: `tablesTotal` en EventForm, ocupación + partySize editable en ReservationsSection
- [x] i18n keys (checkout + producer)
- [x] e2e: checkout→webhook→reserva, FAILED no reserva, PATCH partySize, tablesLeft
- [x] Verificación: tsc api+web, e2e, impeccable detect, regen openapi/postman
