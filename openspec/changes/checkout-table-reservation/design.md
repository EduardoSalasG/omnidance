# Design — checkout-table-reservation

## Decisiones

**Inventario en el Event, no en el Venue.** `Event.tablesTotal Int?`:
las mesas cambian por noche (layout, sector, aforo), no son un atributo fijo
del local. null = el evento no ofrece mesas → el checkout ni pregunta.

**Disponibilidad referencial, no cap duro.** `tablesLeft = tablesTotal −
count(REQUESTED|CONFIRMED)`. Las activas ocupan cupo (demanda honesta);
el checkout bloquea el toggle a ≤0 pero la API no rechaza requests — el
productor decide (puede liberar/agregar mesas). El disclaimer al comprador
lo declara explícito: "disponibilidad referencial, el tamaño podría
ajustarse".

**La reserva nace al PAID, no al submit.** `Payment.tablePartySize Int?`
guarda la intención; el webhook crea la `TableReservation REQUESTED` dentro
de la tx de tickets. Una mesa sin entrada es ruido (abandonos, FAILED) —
igual que el ticket, se emite solo con pago confirmado. Si la persona ya
tiene una activa en el evento, se omite (dedup defensivo).

**El productor ajusta `partySize`.** `PATCH /table-reservations/:id` gana
`partySize?` — "el tamaño podría cambiar" necesita la acción que lo hace
real. En la consola se edita inline al confirmar.

**Notificación al productor** (`notifySafe`, TRANSACTIONAL) al crearse la
reserva desde el webhook — la demanda llega sin que refresque la consola.

## Contratos

- `GET /events/:id` → `+ tablesTotal: number | null, tablesLeft: number | null`
- `POST /checkout/ticket` → `+ tablePartySize?: number (1–12)`
- `PATCH /table-reservations/:id` → `+ partySize?: number (≥1)`
- `POST/PATCH /events` → `+ tablesTotal?: number | null (≥0)`

## Flujo

```
checkout ──tablePartySize──▶ Payment(PENDING).tablePartySize
webhook PAID ──▶ TableReservation REQUESTED + notify producer
producer ──▶ ReservationsSection: ocupación + confirm/ajustar/cancelar
```
