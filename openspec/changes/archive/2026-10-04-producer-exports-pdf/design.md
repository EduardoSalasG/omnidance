# Design — producer-exports-pdf

## Decisiones

- **Un solo origen de datos**: `exportSales/Checkins/Guestlist` retornan
  `ExportTable {headers, rows, summary}`. CSV (toCsv) y PDF
  (buildTablePdf) consumen lo mismo — drift imposible entre formatos.
- **pdfkit en vez de headless browser**: `pdfkit@0.20.2` puro JS, sin
  Chromium ni binarios nativos — el PDF es una tabla de texto, no HTML.
- **`StreamableFile`** en la respuesta: un Buffer desnudo en passthrough
  Nest se serializa como JSON; `StreamableFile` emite el binario real.
- **Paginación manual**: pdfkit ≥0.16 asigna `width` por defecto a todo
  `text()` salvo con `lineBreak:false`, y el wrapper pagina
  implícitamente. Las celdas se truncan a una línea con `widthOfString`
  + elipsis y se dibujan con `lineBreak:false` sin `width` — el único
  `addPage` es el explícito del builder.
- **Resumen por dataset**: `sales` (tickets + recaudado sin cancelados),
  `checkins` (totales + anulados), `guestlist` (invitados + listas) —
  líneas de texto bajo el subtítulo, no una tabla extra.
