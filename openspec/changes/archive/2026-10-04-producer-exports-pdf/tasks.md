# Tasks — producer-exports-pdf

## 1. API

- [x] 1.1 Refactor: `exportSales/Checkins/Guestlist` retornan
  `ExportTable {headers, rows, summary}` compartidos CSV/PDF.
- [x] 1.2 `src/common/pdf-report.ts` — `buildTablePdf` (A4, header
  repetido, paginación manual con `lineBreak:false` + truncado por
  `widthOfString`, «Página X de Y»).
- [x] 1.3 Endpoints `GET :id/export.pdf` y
  `GET series/:seriesId/export.pdf` + `export.csv` de serie con columna
  `evento`; respuesta vía `StreamableFile`.
- [x] 1.4 Tests en `events.controller.spec.ts`: PDF evento+serie
  (magic bytes, auth, 400/404), paridad de datasets.

## 2. UI

- [x] 2.1 `ExportSection`: cada dataset con botones CSV y PDF (evento y
  serie).
- [x] 2.2 i18n `parts/producer.json` (labels/hints PDF).

## 3. Cierre

- [x] 3.1 Specs verdes + `tsc --noEmit` api/web + suite API.
- [x] 3.2 Smoke live `scripts/smoke-export-pdf.cjs` (200 + `%PDF-` owner,
  403 stranger, 400 dataset, 404 inexistente, 401 sin sesión, BOM CSV).
- [x] 3.3 `docs/openapi.json` + postman regenerados (193 paths);
  `docs/architecture.md` actualizado.
