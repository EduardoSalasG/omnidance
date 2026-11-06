# academy-cobros-export

## Why

El reporte de cobros (`/academia/cobros/reporte`) no tenía export.
El usuario lo necesita para cobranza: CSV operativo y PDF presentable
con identidad de marca.

## What Changes

- `GET /academies/:id/billing-report.{csv,pdf}`: dataset completo sin
  paginar (cap 5000), mismos filtros (from/to/planId/status) + `lang`
  para labels, filename y contenido localizados.
- `buildTablePdf` restyleado con marca (accent #7c3aed, wordmark
  Omnidance, filas alternas tinte, footer mutado): todos los exportes
  PDF existentes (analítica, eventos) heredan la identidad.
- Botones csv/pdf en la página del reporte (`<a download>`), con los
  filtros actuales y `lang` del locale de la app.

## Capabilities

- academies/console-lists: export del reporte de cobros.
