# academy-analitica-cascade

## Why

En Analítica los filtros de asistencia eran planos: cualquier serie,
horario, clase o instructor combinaba con cualquier otro y el usuario
elegía opciones que no traían resultados. El review manual pidió
cascada real: nivel → serie → horario → clase, y horario → instructor.

## What Changes

- Filtro nuevo `levelId` (fuente `academyLevels`: solo niveles usados
  por las series activas de la academia) antes del de serie.
- `FilterDef.dependsOn`: la UI re-pide `/query/options` con los
  valores de los filtros padre y limpia la selección en cadena cuando
  cambian.
- `/query/options` acepta params de dependencia (`levelId`,
  `seriesId`, `slotId`) y las fuentes academy los aplican.
- instructorId acotado por slotId: solo el instructor de ese horario.

## Capabilities

- analytics/query-console: dependsOn, cascada, nivel en asistencia.
