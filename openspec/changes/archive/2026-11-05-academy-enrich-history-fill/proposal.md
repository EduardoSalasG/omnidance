# Proposal: academy-enrich-history-fill

## Why

La auditoría del seed vs la matriz de tiers dejó dos brechas de demo:
staff=0 en TODAS las academias (feature desde STUDIO), videos solo en
Mambo Madness (las otras PRO vacías) y niveles custom en una sola.
Además la historia de clases/asistencias/claims arranca en octubre -
los dashboards de tendencia necesitan varios meses (desde septiembre).

## What Changes

- **Historia desde septiembre**: `materializeMonths` corre desde
  2026-09-01 hasta el mes siguiente al vigente. Clases pasadas sin
  reservas reciben `ClassBooking` BOOKED deterministas del roster antes
  de las asistencias (shape real: reserva → asistencia 60-85%).
- **Claims multi-mes**: APPROVED se siembra en los 3 meses de historia
  (no solo actual + anterior).
- **Staff**: 1 `AcademyStaff` delegado (canStudents+canSchedule) por
  academia STUDIO+ sin colaboradores.
- **Videos**: top-up a 3 por academia PRO (url externa sintética).
- **Niveles custom**: línea propia en una academia STUDIO adicional.

## Capabilities

- **Modified Capabilities**: `academy-demo-seed`.
