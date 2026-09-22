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
- Disponibilidad referencial: `tablesLeft = tablesTotal − reservas activas
  (REQUESTED|CONFIRMED)`, expuesta en `GET /events/:id` junto a `tablesTotal`.
- Checkout: sección "¿Quieres mesa?" — oculta si el evento no tiene mesas;
  muestra "Sin mesas disponibles" si `tablesLeft ≤ 0`; si hay, Sí/No y al Sí
  un stepper de personas + disclaimer de disponibilidad referencial y tamaño
  ajustable al confirmar.
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

- **Schema**: `Event.tablesTotal`, `Payment.tablePartySize` (`db push` +
  client regen).
- **API**: `events.controller` (DTOs + detail select + availability),
  `checkout.controller/service` (campo + persistencia en orden),
  `webhook.controller` (creación de la reserva + notificación al productor),
  `table-reservations.controller` (`partySize` en PATCH).
- **Web**: checkout-client (sección mesa), checkout page (tipo), EventForm +
  ReservationsSection + shared types, i18n `checkout`/`producer`/`events`.
- **Tests**: e2e checkout→webhook→reserva; PATCH partySize; disponibilidad.
- **Docs**: openapi.json + postman regenerados.
