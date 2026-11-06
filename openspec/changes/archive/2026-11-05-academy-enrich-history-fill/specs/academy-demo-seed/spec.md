# Delta: academy-demo-seed

## ADDED Requirements

### Requirement: Profundidad histórica de la demo

El script SHALL sembrar actividad académica desde el mes de inicio de
la escena demo (septiembre 2026) hasta el mes siguiente al vigente:
clases materializadas para todo slot vivo en ese rango, reservas
`ClassBooking` BOOKED deterministas del roster de cada academia antes
de las asistencias (la asistencia referencia la reserva, nunca alumnos
sin reserva) y `PaymentClaim` APPROVED distribuidos en cada mes de la
historia.

#### Scenario: Dashboard con varios meses

- **GIVEN** una academia STUDIO+ con slots vivos
- **WHEN** corre el enrich
- **THEN** existen clases dictadas con reservas y asistencias en cada
  mes desde septiembre, y el Facturado del dashboard muestra claims
  aprobados por mes

### Requirement: Data de features por tier

Las academias SHALL recibir data demo de las features que su tier
cubre: `AcademyStaff` delegado en academias STUDIO+ sin colaboradores,
`Video` en academias PRO (top-up hasta 3) y una línea de `ClassLevel`
custom en al menos una academia STUDIO además de las existentes.

#### Scenario: Equipo y videos pobladas

- **GIVEN** una academia STUDIO sin staff y una PRO sin videos
- **WHEN** corre el enrich
- **THEN** la STUDIO queda con 1 colaborador delegado y la PRO con 3
  videos enlazados externamente
