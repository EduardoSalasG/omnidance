# events/table-reservations (delta)

## Purpose

Extiende la reserva de mesa con inventario por evento y ajuste del tamaño
de la reserva por el productor. La disponibilidad es referencial: orienta la
decisión del comprador, pero la confirmación (y el tamaño final) siempre la
tiene el productor.

## ADDED Requirements

### Requirement: inventario de mesas del evento

`Event.tablesTotal` (Int, null = sin servicio), `Event.tableSeatMax` (Int,
tope por reserva) y `Event.tableSeatsTotal` (Int, cupo sentable total —
distinto del aforo del evento y usualmente menor) SHALL ser editables por
el productor del evento en create y PATCH. El detalle público
`GET /events/:id` SHALL exponerlos junto a `tablesLeft`
(`tablesTotal − reservas activas REQUESTED|CONFIRMED`) y `seatsLeft`
(`tableSeatsTotal − Σ partySize de las activas`, clamp ≥0; null cuando el
evento no tiene mesas o no configuró cupo).

#### Scenario: productor configura mesas

- **WHEN** el productor crea o edita un evento con `tablesTotal: 8,
  tableSeatMax: 6, tableSeatsTotal: 40`
- **THEN** el detalle devuelve esos valores, `tablesLeft: 8` menos las
  reservas activas y `seatsLeft: 40` menos las personas de las activas

#### Scenario: sin servicio de mesas

- **WHEN** `tablesTotal` es null
- **THEN** `tablesLeft` y `seatsLeft` son null y el checkout no ofrece la
  sección de mesa

#### Scenario: cupo sentable es el cap real

- **WHEN** un evento tiene `tablesTotal: 8` y `tableSeatsTotal: 40` con
  reservas activas que suman 36 personas
- **THEN** `tablesLeft` puede ser positivo pero `seatsLeft: 4` — una reserva
  de 5 personas ya no cabe aunque queden mesas

### Requirement: defaults de mesas del productor

`ProducerParams.{tablesTotal,tableSeatMax,tableSeatsTotal}` SHALL ser
editable por el propio productor (a diferencia de los fees, solo-admin) en
`GET/PUT /producer/table-params` (productor APPROVED o admin.access). Los
eventos SHALL heredarlos: en create un campo ausente toma el default y
`tablesTotal: null` explícito apaga el servicio; en PATCH `tablesTotal:
null` apaga y null en los límites vuelve a heredar el default.

#### Scenario: herencia en create

- **WHEN** el productor tiene defaults `{tablesTotal: 8, tableSeatMax: 6,
  tableSeatsTotal: 40}` y crea un evento sin campos de mesa
- **THEN** el evento queda con esos tres valores

#### Scenario: override gana

- **WHEN** crea el evento con `tableSeatsTotal: 24`
- **THEN** el evento usa 24 y hereda `tablesTotal`/`tableSeatMax` del
  productor

#### Scenario: apagar el servicio en un evento

- **WHEN** crea o edita con `tablesTotal: null` explícito
- **THEN** el evento no ofrece mesas aunque el productor tenga defaults

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
