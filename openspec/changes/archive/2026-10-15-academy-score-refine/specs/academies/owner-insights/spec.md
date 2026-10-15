## ADDED Requirements

### Requirement: Score y segmento visibles en el módulo de alumnos

La lista `/academia/alumnos` SHALL mostrar por fila el score del alumno
(número entero redondeado) con un badge de segmento cuando
`segment != null`, usando las etiquetas i18n del catálogo. Filas con
`score: null` SHALL mostrar un placeholder discreto ("—" o equivalente),
no un cero.

La ficha `/academia/alumnos/[personId]` SHALL mostrar el score, el
segmento y, cuando `breakdown != null`, el desglose por componente
(asistencia reciente, racha semanal, meses continuos, compras,
antigüedad, referrals) con los puntos aportados por cada uno. Cuando
`breakdown` es null la ficha SHALL mostrar solo número + segmento.

#### Scenario: badge en la lista

- **GIVEN** un alumno `score=72, segment=CORE`
- **WHEN** el owner abre `/academia/alumnos`
- **THEN** la fila muestra "72" y el badge de núcleo

#### Scenario: ficha con desglose

- **GIVEN** un alumno con `breakdown` poblado
- **WHEN** el owner abre su ficha
- **THEN** ve los componentes con sus puntos además del total
