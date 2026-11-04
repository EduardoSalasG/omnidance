# Delta: academies/console-lists

## ADDED Requirements

### Requirement: Colas operativas con historial resuelto acotado

Las colas operativas de la consola (`/academia/cobros`,
`/academia/preventas`) SHALL separar trabajo pendiente de historial
resuelto: sin filtro explícito la vista muestra los ítems accionables
y un historial resuelto acotado por preview expandible (`LIST_PREVIEW`
+ "Ver todo"); con filtro de status explícito se comporta como
listado. La cola PENDING también acota su render por preview cuando
excede el umbral visual, expandible en la misma página.

#### Scenario: preventas separa pendientes de resueltos

- **GIVEN** 4 acuerdos INVITED y 30 resueltos
- **WHEN** el owner abre `/academia/preventas` sin filtro
- **THEN** ve los 4 pendientes completos y el historial resuelto
  acotado a 5 con "Ver todo (30)"

#### Scenario: cola de claims con muchos pendientes

- **GIVEN** 60 claims PENDING
- **WHEN** el owner abre `/academia/cobros` sin filtro
- **THEN** ve el preview acotado con "Ver todo (60)" en vez de 60
  cards de corrido

### Requirement: FilterBar en todas las secciones de listado

Toda sección de listado de la consola SHALL exponer el `FilterBar`
compartido con su `EntityDef`/`QueryFilters` cuando el endpoint
soporta búsqueda (`q`) o filtros — sin secciones con solo `Pager`
(instructor-section debe igualar a staff-section).

#### Scenario: búsqueda de instructores

- **WHEN** el owner filtra por nombre en la sección de profesores
- **THEN** el `FilterBar` aplica `q` y el `Pager` refleja el total
  filtrado
