# checkout-table-reservation

## Why

El checkout de preventa es el momento natural para ofrecer mesa (spec §13:
"Checkout preventa | Ticket + cargo de servicio, reserva de mesa opcional").
Hoy `TableReservation` existe solo como endpoint standalone sin superficie de
consumo y sin inventario: el bailarín no puede pedir mesa al comprar y el
productor no puede declarar cuántas mesas tiene la noche ni ajustar el tamaño
de una reserva al confirmarla.

## What Changes

- `Event.tablesTotal Int?` — mesas reservables de la noche; `null` = sin
  servicio de mesas. Editable por el productor en crear/editar evento
  (dinámico: puede cambiar con la configuración del local).
- `Event.tableSeatMax Int?` + `Event.tableSeatsTotal Int?` — tope por
  reserva y cupo sentable total. El cupo sentable es el inventario real:
  **distinto del aforo del evento y usualmente menor** — la disponibilidad
  se valida en personas sentadas, no en mesas.
- `ProducerParams.{tablesTotal,tableSeatMax,tableSeatsTotal}` — defaults
  del productor, editables en `/productor/parametros`
  (`GET/PUT /producer/table-params`). Cadena: override del evento →
  default del productor → sin servicio. En create, ausente hereda y
  `tablesTotal: null` explícito apaga; en PATCH, null en los límites
  vuelve a heredar el default.
- Disponibilidad referencial: `tablesLeft = tablesTotal − reservas activas
  (REQUESTED|CONFIRMED)` y `seatsLeft = tableSeatsTotal − Σ partySize
  activas`, expuestos en `GET /events/:id`.
- Checkout: sección "¿Quieres mesa?" — oculta si el evento no tiene mesas;
  muestra "Sin mesas disponibles" si `tablesLeft ≤ 0` o `seatsLeft ≤ 0`;
  si hay, Sí/No y al Sí un stepper de personas acotado por
  `min(tableSeatMax, seatsLeft)` + disclaimer de disponibilidad referencial
  y tamaño ajustable al confirmar.
- `POST /checkout/ticket` acepta `tablePartySize?`; se guarda en
  `Payment.tablePartySize` y el webhook materializa `TableReservation`
  `REQUESTED` solo cuando el pago queda `PAID` (una mesa sin ticket no tiene
  sentido). Notificación al productor.
- Gestión del productor: `PATCH /table-reservations/:id` acepta `partySize`
  (ajuste al confirmar — el disclaimer al comprador lo promete);
  `ReservationsSection` muestra ocupación `activas/total` y permite editar
  el tamaño; `EventForm` gana el campo "Mesas reservables".

## Capabilities

### New Capabilities

(ninguna — extiende capacidades ya especificadas)

### Modified Capabilities

- `events/table-reservations`: agrega inventario por evento
  (`tablesTotal`), disponibilidad referencial y ajuste de `partySize` por el
  productor.
- `checkout/ticket-purchase`: agrega la reserva de mesa opcional dentro de
  la orden (intención en `Payment`, materialización al `PAID`).

## Impact

- **Schema**: `Event.{tablesTotal,tableSeatMax,tableSeatsTotal}`,
  `ProducerParams.{tablesTotal,tableSeatMax,tableSeatsTotal}`,
  `Payment.tablePartySize` (`db push` + client regen).
- **API**: `events.controller` (DTOs + herencia de defaults en create/PATCH
  + `tablesLeft`/`seatsLeft` en detail), `producer.controller`
  (`GET/PUT /producer/table-params`), `checkout.controller/service`
  (campo + persistencia + validación seatMax/seatsLeft),
  `webhook.controller` (creación de la reserva + notificación al productor),
  `table-reservations.controller` (`partySize` en PATCH + aviso al
  solicitante con el tamaño final).
- **Web**: checkout-client (sección mesa acotada por seatMax/seatsLeft),
  checkout page (tipo), EventForm (3 campos con herencia), ReservationsSection
  (ocupación en mesas y asientos), `/productor/parametros` (card editable de
  defaults de mesas), i18n `checkout`/`producer`/`producerParams`.
- **Tests**: e2e checkout→webhook→reserva; FAILED no reserva; PATCH
  partySize; tablesLeft/seatsLeft; seatMax→400; seatsLeft→409;
  herencia/override/disable en POST+PATCH; table-params GET/PUT.
- **Docs**: openapi.json + postman regenerados.
