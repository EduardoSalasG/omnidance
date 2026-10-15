## ADDED Requirements

### Requirement: Scores por actor en la ficha de usuario admin

El detalle de usuario del admin SHALL incluir la lista de
`RelationshipScore` de la persona: por cada fila `{actorType, actorId,
score, segment, computedAt, breakdown}` ordenada por score descendente,
con el nombre del actor resuelto (academia/venue por su tabla; producer
por `Person.name`). La UI `/admin/usuarios/[personId]` SHALL mostrar una
sección "Scores por actor" con score, segmento y desglose por fila; si
la persona no tiene scores la sección MUST NOT renderizarse.

#### Scenario: alumno de dos academias

- **GIVEN** una persona con RelationshipScore en academias A y B
- **WHEN** el admin abre su ficha
- **THEN** ve ambas filas con nombre de academia, score, segmento y
  desglose

#### Scenario: sin scores

- **WHEN** el admin abre la ficha de una persona sin scores
- **THEN** la sección "Scores por actor" no se renderiza

### Requirement: Salud de alumnos por academia en /admin

El sistema SHALL exponer `GET /admin/academies/score-health`: por cada
academia con al menos un `RelationshipScore` computado, `{academyId,
academyName, students, avgScore, segments: {CORE, AT_RISK, NEW,
BRINGS_PEOPLE, NONE}, top: [{personId, name, score}] (máx 3), atRisk:
[{personId, name, score}] (máx 5)}`, ordenado por `avgScore`
descendente.

La UI SHALL tener la página `/admin/academias` listando esa salud por
academia (card/fila clickeable que expanda o enlace a la tabla de
alumnos con scores de esa academia) accesible desde el hub /admin.

#### Scenario: dos academias con scores

- **GIVEN** academia A (avg 70, 2 CORE) y B (avg 40, 3 AT_RISK)
- **WHEN** el admin abre `/admin/academias`
- **THEN** ve A primero con su distribución y en B el bloque "en riesgo"
  con hasta 5 personas
