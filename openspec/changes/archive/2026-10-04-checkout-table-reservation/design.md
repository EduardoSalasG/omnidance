# Design — checkout-table-reservation

## Decisiones

**Inventario en el Event, no en el Venue.** `Event.tablesTotal Int?`:
las mesas cambian por noche (layout, sector, aforo), no son un atributo fijo
del local. null = el evento no ofrece mesas → el checkout ni pregunta.

**El inventario real es en personas sentables, no en mesas.** `tablesTotal`
describe cuántas mesas hay, pero lo que consume una reserva son asientos:
`seatsLeft = tableSeatsTotal − Σ partySize(REQUESTED|CONFIRMED)`. El cupo
sentable es **distinto del aforo del evento y usualmente menor** — un evento
de 300 personas puede sentar solo 40 en mesas. `tableSeatMax` acota cada
reserva individual. El checkout rechaza en API: `tablePartySize >
tableSeatMax` → 400; `tablePartySize > seatsLeft` → 409 (sold-out, mismo
mapeo que preventa/puerta). `tablesLeft` queda como lectura rápida de
mesas libres.

**Defaults por productor con herencia.** `ProducerParams` gana los tres
campos de mesa — los edita el propio productor en `/productor/parametros`
(a diferencia de los fees, que son solo-admin): son operativos, no
financieros. Cadena: override del evento → default del productor → null
(sin servicio). En create, un campo ausente hereda el default y
`tablesTotal: null` explícito apaga el servicio aunque haya default; en
PATCH, `tablesTotal: null` apaga y null en los límites vuelve a heredar.
Sin default del productor ni override → evento sin mesas.

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

- `GET /events/:id` → `+ tablesTotal, tableSeatMax, tableSeatsTotal,
  tablesLeft, seatsLeft: number | null`
- `POST /checkout/ticket` → `+ tablePartySize?: number (1–50)`; valida
  `tableSeatMax` (400) y `seatsLeft` (409) del evento
- `PATCH /table-reservations/:id` → `+ partySize?: number (≥1)`
- `POST/PATCH /events` → `+ tablesTotal, tableSeatMax, tableSeatsTotal?:
  number | null` — ausente/null hereda el default del productor
- `GET/PUT /producer/table-params` → `{ tablesTotal, tableSeatMax,
  tableSeatsTotal: number | null }` (productor APPROVED o admin.access)

## Flujo

```
checkout ──tablePartySize──▶ Payment(PENDING).tablePartySize
webhook PAID ──▶ TableReservation REQUESTED + notify producer
producer ──▶ ReservationsSection: ocupación + confirm/ajustar/cancelar
```
