# producer-export — exporte CSV operativo por evento

## Purpose

El productor puede llevarse los datos operativos de su evento (ventas,
check-ins, listas de invitados) a planilla para cuadratura post-evento —
la spec §11 promete "Exportes — CSV/PDF por evento y serie" y no existía
ningún endpoint CSV.

## ADDED Requirements

### Requirement: Exporte CSV por evento

El sistema SHALL exponer `GET /events/:id/export.csv?dataset=<d>` que
devuelve `text/csv; charset=utf-8` con `Content-Disposition: attachment`,
BOM UTF-8 inicial y escaping CSV (campos con `,"` `\n` o `\r` entre
comillas, comillas internas duplicadas). Autorización: owner del evento
(`producerId`) o `admin.access` — mismo patrón que `GET /events/:id/live`.

#### Scenario: descarga autorizada

- **GIVEN** un evento del productor autenticado
- **WHEN** hace `GET /events/:id/export.csv?dataset=sales`
- **THEN** responde 200 `text/csv` con `Content-Disposition: attachment`
  y el cuerpo CSV con BOM

#### Scenario: rechazos

- **WHEN** el solicitante no es owner ni `admin.access` → 403
- **WHEN** el evento no existe → 404
- **WHEN** `dataset` falta o no es `sales|checkins|guestlist` → 400

### Requirement: Dataset sales

El CSV `sales` SHALL listar una fila por `Ticket` del evento con columnas
`fecha,comprador,asistente,precio_lista,cargo_servicio,total,estado,canal,payment_id`.
`total` = `listPrice + serviceFee`; `canal` viene de `Payment.channel`
via `ticket.paymentId`.

#### Scenario: venta con pago trazable

- **GIVEN** un ticket ACTIVE con `paymentId` → `Payment { channel: "WEB" }`
- **WHEN** se exporta `sales`
- **THEN** la fila muestra `canal=WEB`, el `payment_id` y nombres de
  comprador/asistente resueltos desde Person

#### Scenario: ticket sin pago y secretos

- **WHEN** el ticket no tiene `paymentId` (histórico/manual)
- **THEN** `canal` y `payment_id` salen vacíos
- **AND** ninguna fila expone `claimToken` ni ids internos de persona

### Requirement: Dataset checkins

El CSV `checkins` SHALL listar una fila por `Checkin` del evento —
incluye anulados — con columnas `entrada,salida,metodo,persona,anulado,nota`.

#### Scenario: check-in anulado

- **WHEN** un check-in tiene `voidedAt` no nulo
- **THEN** su fila marca `anulado=si` y conserva `entrada`/`metodo`

### Requirement: Dataset guestlist

El CSV `guestlist` SHALL listar una fila por `GuestListEntry` de las
`GuestList` del evento con columnas `lista,dueno_lista,invitado,estado,creado`.

#### Scenario: lista con invitados

- **GIVEN** una lista "Cumple de X" con dos entradas (una ARRIVED)
- **WHEN** se exporta `guestlist`
- **THEN** salen dos filas con el label de la lista, el nombre del dueño,
  el invitado y su estado
