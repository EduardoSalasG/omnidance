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
- [x] Schema: `Event.{tableSeatMax,tableSeatsTotal}` + `ProducerParams.{tablesTotal,tableSeatMax,tableSeatsTotal}` + `db push`
- [x] API: `GET/PUT /producer/table-params` (productor APPROVED/admin.access, invalida cache)
- [x] API events: herencia de defaults en create (ausente hereda, null apaga) y PATCH (null en límites vuelve al default); detail expone `tableSeatMax`/`tableSeatsTotal`/`seatsLeft`
- [x] API checkout: valida `tablePartySize ≤ tableSeatMax` (400) y `≤ seatsLeft` (409)
- [x] Web: EventForm con 3 campos + hint de herencia; `/productor/parametros` card editable de defaults; checkout acota stepper por seatMax/seatsLeft; ReservationsSection muestra ocupación en asientos
- [x] Seed: defaults de mesas en carlos (8/6/40), overrides en Bachatamanía (10/8/60) y noches de finde (8/6/48); muvetOwner y el resto sin mesas
- [x] e2e: seatMax→400, seatsLeft→409, herencia/override/disable POST+PATCH, table-params GET/PUT
- [x] Verificación: tsc api+web, e2e, impeccable detect, regen openapi/postman
