# events/producer-export Specification

## Purpose
El productor puede llevarse los datos operativos de su evento (ventas,
check-ins, listas de invitados) a planilla para cuadratura post-evento —
la spec §11 promete "Exportes — CSV/PDF por evento y serie" y no existía
ningún endpoint CSV.

## Requirements

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

### Requirement: Exporte PDF por evento

El sistema SHALL exponer `GET /events/:id/export.pdf?dataset=<d>` que
devuelve `application/pdf` con un reporte imprimible A4: título con el
nombre del evento, subtítulo con fecha del evento y timestamp de
generación, líneas de resumen del dataset, tabla con header repetido en
cada página y pie «Página X de Y». Los datasets, columnas y reglas de
autorización/rechazo son idénticos a los del CSV (owner del evento o
`admin.access`; dataset inválido → 400, inexistente → 404, sin sesión →
401). La respuesta se emite como stream binario (el cuerpo comienza con
`%PDF-`), nunca serializado como JSON.

#### Scenario: descarga autorizada

- **GIVEN** un evento del productor autenticado
- **WHEN** hace `GET /events/:id/export.pdf?dataset=sales`
- **THEN** responde 200 `application/pdf` y el cuerpo inicia con `%PDF-`

#### Scenario: contenido del reporte

- **WHEN** se exporta cualquier dataset a PDF
- **THEN** el PDF incluye el título del evento, el resumen del dataset
  (sales: tickets + recaudado sin cancelados; checkins: totales +
  anulados; guestlist: invitados + listas), la tabla completa y
  numeración de páginas
- **AND** las celdas largas se truncan con elipsis — ninguna rompe el
  layout ni genera páginas vacías

#### Scenario: rechazos idénticos al CSV

- **WHEN** el solicitante no es owner ni `admin.access` → 403
- **WHEN** el evento no existe → 404
- **WHEN** `dataset` falta o no es `sales|checkins|guestlist` → 400
- **WHEN** no hay sesión → 401

### Requirement: Exportes por serie

El sistema SHALL exponer `GET /events/series/:seriesId/export.csv` y
`GET /events/series/:seriesId/export.pdf` con los mismos datasets,
columnas y formatos del nivel evento, agregando una fila por registro de
cada evento de la serie con columna adicional `evento` (nombre). El
resumen agrega la cantidad de eventos. Autorización: owner de la serie
o `admin.access`; mismos rechazos (400/401/403/404).

#### Scenario: PDF de serie

- **GIVEN** una serie con varios eventos del productor autenticado
- **WHEN** hace `GET /events/series/:seriesId/export.pdf?dataset=sales`
- **THEN** responde 200 `application/pdf`, el título usa el nombre de la
  serie, el resumen indica la cantidad de eventos y cada fila identifica
  su evento en la primera columna

#### Scenario: rechazos de serie

- **WHEN** la serie no existe → 404
- **WHEN** el solicitante no es owner ni `admin.access` → 403

### Requirement: Serializadores compartidos

El sistema SHALL construir los datasets una sola vez como
`{headers, rows, summary}` por consulta y serializarlos a CSV o PDF —
ningún formato puede divergir en columnas ni filas. Ningún formato
expone `claimToken` ni ids internos de persona.

#### Scenario: paridad CSV/PDF

- **WHEN** se exporta el mismo dataset del mismo evento a CSV y a PDF
- **THEN** ambos contienen las mismas filas y columnas (misma fuente de
  datos)
