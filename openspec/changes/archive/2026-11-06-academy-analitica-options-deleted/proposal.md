# academy-analitica-options-deleted

## Why

Los selectores de filtros de Analítica incluían opciones de series
soft-deleted (32 opciones vs 11 activas, con nombres repetidos) y las
series con nombre idéntico no se podían distinguir. Continuación del
fix de `academy-analitica-ux`.

## What Changes

- `academyClassSeries`, `academyScheduleSlots` y `academyClasses`
  excluyen `deletedAt` (serie y slot).
- El label de serie incluye el horario ("Serie · mar 21:30") para
  desambiguar nombres repetidos (spec: opciones sin duplicados por
  etiqueta).
