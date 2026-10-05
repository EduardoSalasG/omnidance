# producer-exports-pdf

## Why

`producer-exports` entregó el CSV por evento y dejó explícito fuera de
scope: el exporte por serie (agrega N eventos) y el formato PDF — la
mitad exacta de lo que la spec §11 promete ("CSV/PDF por evento y
serie"). El productor que imprime o adjunta la cuadratura no tiene un
artefacto legible: el CSV es para planilla, no para compartir.

## What Changes

- **`GET /events/:id/export.pdf?dataset=sales|checkins|guestlist`** —
  reporte PDF A4 imprimible del evento: título, fecha y hora de
  generación, resumen del dataset, tabla con header repetido y
  paginación «Página X de Y». Misma autorización y datasets que el CSV
  (owner del evento o `admin.access`; dataset inválido → 400, evento
  inexistente → 404, sin sesión → 401).
- **`GET /events/series/:seriesId/export.csv` y
  `GET /events/series/:seriesId/export.pdf`** — mismos datasets
  agregados sobre todos los eventos de la serie, con columna `evento`
  adicional. Autorización: owner de la serie o `admin.access`.
- **Builder compartido** `src/common/pdf-report.ts` (`buildTablePdf`) —
  el controller produce `{headers, rows, summary}` por dataset una sola
  vez; CSV y PDF son serializadores del mismo dato.
- **UI**: `ExportSection` lista cada dataset con descarga CSV y PDF, a
  nivel evento y a nivel serie; i18n en `parts/producer.json`.

## Capabilities

### Modified Capabilities

- `events/producer-export`: agrega formato PDF y nivel serie al mismo
  contrato de datasets/autorización — sin cambios en las columnas ni en
  los rechazos ya especificados.
