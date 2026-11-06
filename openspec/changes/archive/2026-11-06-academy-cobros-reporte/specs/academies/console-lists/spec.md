# Delta: academies/console-lists

## ADDED Requirements

### Requirement: Paginación 20/10 en listas pesadas

Toda lista pesada de las consolas SHALL paginar con 20 ítems por página
en desktop (viewport ≥1024px) y 10 en mobile, resuelto en cliente vía
media query (`useConsolePageSize`). El tamaño de página viaja como
`pageSize` del envelope paginado; al cambiar de página o de tamaño el
listado re-consulta.

#### Scenario: reporte en mobile

- **WHEN** el owner abre `/academia/cobros/reporte` en un viewport
  <1024px con 25 cobros
- **THEN** la lista muestra 10 por página y el `Pager` ofrece 3 páginas

### Requirement: Preview expandible en "planes que vencen"

La lista de inscripciones por vencer SHALL expandir sus ítems ocultos
en el lugar con `SeeAllRow` (preview acotado, "Ver todos" alterna a
"Mostrar menos"), nunca navegando a otro listado. Las filas siguen
llevando a la ficha del alumno.

#### Scenario: expandir vencimientos

- **GIVEN** más ítems por vencer que el preview
- **WHEN** el owner toca "Ver todos"
- **THEN** la misma sección muestra la lista completa sin salir de la
  página
