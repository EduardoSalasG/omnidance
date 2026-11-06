# Delta: academies/owner-insights

## MODIFIED Requirements

### Requirement: Card de alumnos por nivel y cupos por horario

El inicio de /academia SHALL mostrar (modo Extendido) una card con
alumnos activos por tipo×nivel y, por cada horario **de una serie
vigente** (`series.deletedAt: null`), alumnos asignables, capacidad,
cupos vacíos, promedio de asistencia y asistencia de la última clase.
Los horarios de series eliminadas lógicamente MUST NOT aparecer en la
card ni alimentar sus métricas. Alumnos sin nivel asignado SHALL
agruparse en "sin nivel" para que el owner complete el dato.

#### Scenario: Owner elige horario para alumno nuevo

- **WHEN** el owner abre el inicio Extendido
- **THEN** ve por cada horario cuántos cupos vacíos quedan por nivel y
  puede decidir a cuál derivar al alumno sin saturar

#### Scenario: Horario de serie eliminada no cuenta

- **GIVEN** una serie eliminada lógicamente cuyos slots siguen en la
  base (borrado directo en datos)
- **WHEN** el owner abre "Niveles y cupos"
- **THEN** esos slots no aparecen y sus clases no entran a los
  promedios ni a "próxima clase"
