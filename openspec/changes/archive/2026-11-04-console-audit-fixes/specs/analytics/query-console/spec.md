# Delta: analytics/query-console

## ADDED Requirements

### Requirement: Drill-down a ficha de persona desde resultados

Cuando una fila de la tabla de resultados de `/analitica` expone un
`personId` (sujeto persona de la entidad consultada), la celda
correspondiente SHALL ser un `<Link>` a
`/analitica/usuarios/[personId]` en vez de texto plano. Las entidades
sin persona identificable quedan como texto.

#### Scenario: resultado con persona navegable

- **GIVEN** una consulta de ACADEMY_OWNER cuya fila trae `personId`
- **WHEN** se renderiza la tabla de resultados
- **THEN** la celda de la persona linkea a su ficha en
  `/analitica/usuarios/[personId]`

### Requirement: Ficha de persona con listas acotadas

Las listas de la ficha `/analitica/usuarios/[personId]` (productores,
academias por rol, historial de roles, desgloses por academia/estilo/
género, enrollments activas) SHALL usar preview + "Ver todo" con el
componente compartido, y las referencias a actores con ficha propia
(productor, academia, venue) SHALL ser `<Link>` cuando el payload
trae el id.

#### Scenario: desglose por academia expandible

- **GIVEN** un bailarín con actividad en 12 academias
- **WHEN** se abre su ficha de analítica
- **THEN** el desglose muestra 5 filas + "Ver todo (12)"
