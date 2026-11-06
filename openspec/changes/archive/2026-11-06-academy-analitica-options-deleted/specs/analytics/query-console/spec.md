## MODIFIED Requirements

### Requirement: Fuentes FK de academia resolubles sin scope explícito

Las fuentes FK del lente ACADEMY_OWNER (`academyPlans`,
`academyClassSeries`, `academyInstructors`, `academyScheduleSlots`,
`academyClasses`) SHALL resolverse en `GET /query/options` aunque
`scopeId` venga vacío: en ese caso la respuesta es la unión de las
opciones de todas las academias propias del actor, con la misma
semántica de scope que `/query/run` (`academyId` ausente = todas las
propias). Con `scopeId` informado se conserva la validación de
ownership (ajeno → lista vacía, nunca 403 ni datos de otro). Cuando el
actor posee más de una academia los labels SHALL llevar el sufijo
`· {nombre de la academia}` y las opciones se deduplican por `value`.

Un `FilterDef` puede declarar `requiresScope: true`: la barra de
filtros SHALL omitir la resolución sin scope para esas fuentes
(`eventGuestLists` sigue exigiendo `scopeId` → 400 sin él).

Las opciones SHALL excluir registros eliminados: series y slots con
`deletedAt` no nulo, y slots/clases cuya serie fue borrada. Cuando dos
opciones comparten el mismo nombre, el label SHALL incluir contexto
que las desambigüe (en series, su horario abreviado).

#### Scenario: owner de una academia ve sus planes sin elegirla

- **GIVEN** un owner con una sola academia y el filtro Academia en
  "Todas"
- **WHEN** abre el select Plan de la entidad `students`
- **THEN** la UI pidió `/query/options?source=academyPlans&scopeId=` y
  el select lista los planes de su academia

#### Scenario: owner multi-academia sin scope

- **GIVEN** un owner con dos academias
- **WHEN** pide `/query/options?source=academyInstructors` sin
  `scopeId`
- **THEN** recibe los instructores de ambas, cada label con sufijo
  `· {academia}`, sin valores duplicados

#### Scenario: scopeId ajeno sigue vacío

- **WHEN** pide `/query/options?source=academyPlans&scopeId=<ajena>`
- **THEN** `{options: []}` (sin revelar existencia)

#### Scenario: series borradas no aparecen como opción

- **GIVEN** una academia con series soft-deleted
- **WHEN** pide `/query/options?source=academyClassSeries` (con o sin
  `scopeId`)
- **THEN** el select solo lista las series activas; los slots y clases
  cuya serie fue borrada tampoco aparecen en sus fuentes

#### Scenario: series homónimas distinguibles por horario

- **GIVEN** una academia con dos series activas llamadas "Partnerwork"
- **WHEN** abre el filtro de serie
- **THEN** las opciones se leen "Partnerwork · mié 21:30" y
  "Partnerwork · jue 20:30" (o el horario que corresponda)
