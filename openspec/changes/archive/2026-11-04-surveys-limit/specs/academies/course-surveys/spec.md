## MODIFIED Requirements

### Requirement: Resultados agregados y anónimos (owner/admin)

Los resultados SHALL ser visibles solo para el owner de la academia o
ADMIN, SIEMPRE agregados por mes × serie: promedio del curso, promedio
del profesor (cuando exista), conteo de respuestas y lista de
comentarios. NINGÚN endpoint expone `personId`, nombre ni identidad del
evaluador.

Ambos listados aceptan `?limit=` con el mismo contrato: entero,
default 12, máximo 60; un valor inválido cae al default. El cap se
aplica sobre los grupos ya agregados (mes × serie), conservando el
orden por mes descendente.

#### Scenario: Owner consulta encuestas de una serie

- **WHEN** GET `/academies/:id/surveys?seriesId=…&month=…`
- **THEN** responde los grupos `{seriesId, seriesName, month, count,
  avgCourse, avgInstructor, comments[]}` ordenados por mes desc
- **AND** los comentarios no llevan autor

#### Scenario: Owner limita la cantidad de grupos

- **WHEN** GET `/academies/:id/surveys?limit=2` y la academia tiene
  más de dos grupos mes × serie
- **THEN** responde solo los 2 grupos más recientes
- **AND** sin `limit` responde como máximo 12 grupos; `limit` mayor a
  60 se capa en 60

#### Scenario: Owner consulta encuestas de un profesor

- **WHEN** GET `/academies/:id/instructors/:personId/surveys`
- **THEN** responde los mismos grupos filtrados por el `instructorId`
  snapshoteado en cada encuesta

#### Scenario: Staff sin ser owner

- **WHEN** un staff con `attendance`/`students` pero sin `requireAdminister`
  consulta los endpoints de encuestas
- **THEN** responde 403 y el front oculta la sección
