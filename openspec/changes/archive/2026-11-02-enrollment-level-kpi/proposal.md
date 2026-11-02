# enrollment-level-kpi

## Why

El owner de academia necesita saber cuántos alumnos tiene por nivel y
por horario para ofrecer cupo a alumnos nuevos sin saturar clases (el
alumno de iniciación también va a básico: multinivel por tipo de
clase). Reuso de ClassLevel/ClassType/ClassSlot.capacity/Attendance.

## What Changes

- `EnrollmentLevel(enrollment, classType, level)`: niveles del alumno
  por tipo de clase (multinivel), gestionables solo por el owner en la
  ficha del alumno; default iniciación en los tipos de la academia.
- `GET /academies/:id/insights/levels`: alumnos activos por tipo×nivel
  y por horario (asignados, capacidad, cupos, promedio y última
  asistencia).
- KPI card en /academia con el grid (modo Extendido) + sección "sin
  nivel asignado" para completar el dato.

## Capabilities

### New Capabilities

- `academies/enrollment-levels`: nivel del alumno por tipo de clase,
  multinivel, gestión por owner.

### Modified Capabilities

- `academies/owner-insights`: card de niveles/cupos en el inicio
  (modo Extendido); modo Simplificado = cards accionables llanas.

## Impact

- Prisma: EnrollmentLevel + migración.
- API: endpoint insights/levels + gestión de niveles (roster).
- Web: KPI card /academia, editor de niveles en ficha de alumno.
- Principio Don't Make Me Think: lenguaje llano, cards accionables.
