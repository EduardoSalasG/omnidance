# academy-cobros-export-kpis

## Why

Refinamiento del export del reporte de cobros tras el primer uso:
los métodos llegaban crudos (credit_card), los KPIs eran texto plano
y la tabla carecía de numeración de registros.

## What Changes

- Columna `#` numerando cada registro en la tabla del export.
- Normalizador de método para valores crudos (credit_card → Tarjeta,
  snake_case → Title Case, claves conocidas mapeadas por idioma).
- KPIs como cards visuales (misma UI del reporte web): Facturado,
  Alumnos y hasta 2 métodos; overflow en línea de resumen.
- Rango de período formateado en UTC (sin desfase de un día).
