# events/table-reservations (delta)

## Purpose

Extiende la reserva de mesa con inventario por evento y ajuste del tamaño
de la reserva por el productor. La disponibilidad es referencial: orienta la
decisión del comprador, pero la confirmación (y el tamaño final) siempre la
tiene el productor.

## ADDED Requirements

### Requirement: inventario de mesas del evento

`Event.tablesTotal` (Int, null = sin servicio de mesas) SHALL ser editable
por el productor del evento en create y PATCH. El detalle público
`GET /events/:id` SHALL exponer `tablesTotal` y `tablesLeft`
(`tablesTotal − reservas activas REQUESTED|CONFIRMED`; null cuando el
evento no tiene mesas).

#### Scenario: productor configura mesas

- **WHEN** el productor crea o edita un evento con `tablesTotal: 8`
- **THEN** el detalle devuelve `tablesTotal: 8` y `tablesLeft: 8` menos las
  reservas activas

#### Scenario: sin servicio de mesas

- **WHEN** `tablesTotal` es null
- **THEN** `tablesLeft` es null y el checkout no ofrece la sección de mesa

### Requirement: ajuste de tamaño al gestionar

`PATCH /table-reservations/:id` SHALL aceptar `partySize` opcional
(entero ≥1) además de `status` y `tableNo`, para que el productor ajuste el
grupo al confirmar.

#### Scenario: confirmar con ajuste

- **WHEN** el productor confirma una reserva de 10 personas con
  `partySize: 6` y `tableNo: "M4"`
- **THEN** la reserva queda `CONFIRMED` con `partySize: 6` y mesa M4

### Requirement: aviso al solicitante

La transición REQUESTED → CONFIRMED SHALL notificar al solicitante con el
tamaño FINAL confirmado por el productor (y la mesa asignada si la hay);
REQUESTED → CANCELLED por el productor SHALL avisar que la reserva no pudo
confirmarse. Re-ediciones de una reserva ya CONFIRMED (cambiar mesa o
tamaño) no SHALL re-notificar.

#### Scenario: confirmación notifica tamaño final

- **WHEN** el productor confirma una reserva solicitada para 4 ajustándola
  a `partySize: 5` con `tableNo: "M-7"`
- **THEN** el solicitante recibe una notificación `table.confirmed` que
  dice "5 personas · Mesa M-7" — el valor final, no el solicitado
