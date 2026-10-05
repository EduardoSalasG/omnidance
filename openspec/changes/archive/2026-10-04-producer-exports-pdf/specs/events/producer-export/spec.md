# producer-export — PDF y exporte por serie

## ADDED Requirements

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
