# Delta; academies/owner-insights

## ADDED Requirements

### Requirement: Card de alumnos por nivel y cupos por horario

El inicio de /academia SHALL mostrar (modo Extendido) una card con
alumnos activos por tipo×nivel y, por cada horario, alumnos
asignables, capacidad, cupos vacíos, promedio de asistencia y
asistencia de la última clase. Alumnos sin nivel asignado SHALL
agruparse en "sin nivel" para que el owner complete el dato.

#### Scenario: Owner elige horario para alumno nuevo

- **WHEN** el owner abre el inicio Extendido
- **THEN** ve por cada horario cuántos cupos vacíos quedan por nivel y
  puede decidir a cuál derivar al alumno sin saturar

### Requirement: Modo de inicio Simplificado por defecto

El inicio de /academia SHALL ofrecer modo Simplificado (default):
3-4 cards accionables en lenguaje llano (cupos de hoy, alumnos por
vencer, comprobantes por revisar) en vez de métricas crudas; el modo
Extendido muestra las cards analíticas completas. No habrá
configuración de KPIs por usuario.

#### Scenario: Owner abre su inicio

- **WHEN** el owner entra a /academia sin haber elegido modo
- **THEN** ve el modo Simplificado con acciones claras y lenguaje llano
