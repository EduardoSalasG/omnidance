# Delta: owner-insights

## MODIFIED Requirements

### Requirement: Planes por vencer en el dashboard

`GET /academies/:id/dashboard` SHALL incluir `expiringEnrollments`:
inscripciones con status ACTIVE cuyo `endsAt` cae entre hoy y
`academy.insights.expiring_days` (param, default 14) días adelante,
ordenadas por `endsAt` ascendente. Cada ítem SHALL incluir
`{personId, personName, planName, status, endsAt}`; `planName` es null
si la inscripción no tiene plan.

#### Scenario: alumno con plan por vencer

- **GIVEN** una inscripción ACTIVE con `endsAt` en 10 días
- **WHEN** el owner consulta el dashboard
- **THEN** `expiringEnrollments` la lista con nombre, plan y fecha

#### Scenario: filtros de la lista

- **WHEN** una inscripción tiene `endsAt` null, ya vencido, más allá de
  la ventana, o status INACTIVE
- **THEN** no aparece en `expiringEnrollments`

### Requirement: Comparativa de KPIs del mes

`GET /academies/:id/dashboard` SHALL incluir en `kpis` las métricas
comparables computadas sobre el tramo equivalente del mes anterior
(month-to-date: desde el día 1 hasta el mismo día transcurrido):
`activeStudentsMonthPrev`, `billedMonthPrev`, `avgTicketMonthPrev` y
`avgAttendancePerClassMonthPrev` (null cuando el mes anterior no tiene
base; 0 clases dictadas o 0 pagos).

`activeStudentsMonth` SHALL contar **personas únicas** (`personId`) con
enrollment ACTIVE y vigencia no vencida (`endsAt` null o ≥ hoy).
`activeStudentsMonthPrev` SHALL contar personas únicas con enrollment
ACTIVE cuya vigencia intersecta el tramo MTD del mes anterior
(`startedAt` ≤ fin del tramo y `endsAt` null o ≥ inicio del mes
anterior). Como no existe histórico de estados, la comparativa usa el
estado actual del enrollment como aproximación.

Los KPIs sin histórico confiable (`purchasablePlans`, `weeklyClasses`)
MUST NOT llevar comparativa.

La UI SHALL mostrar el delta **absoluto** bajo el valor del KPI cuando
la comparativa no es null: "+N" para aumentos, "-N" para caídas y "="
cuando no hay cambio, seguido de la leyenda "vs mes anterior". Para
KPIs monetarios el delta se formatea en CLP ("+$42.000"); para cards
de porcentaje se usa puntos ("+4 pts").

#### Scenario: alumnos al alza

- **GIVEN** 14 alumnos activos este mes y 11 en el tramo equivalente
  del mes anterior
- **WHEN** se renderiza el KPI "Alumnos activos"
- **THEN** bajo el valor se ve "+3 vs mes anterior"

#### Scenario: facturación al alza

- **GIVEN** facturado MTD $900.000 y $600.000 en el mismo tramo del mes
  anterior
- **WHEN** se renderiza el KPI "Facturado"
- **THEN** bajo el valor se ve "+$300.000 vs mes anterior"

#### Scenario: facturación a la baja

- **GIVEN** facturado MTD $600.000 y $900.000 en el mismo tramo del mes
  anterior
- **WHEN** se renderiza el KPI "Facturado"
- **THEN** bajo el valor se ve "-$300.000 vs mes anterior"

#### Scenario: sin cambio

- **GIVEN** ticket MTD $30.000 y $30.000 en el tramo anterior
- **WHEN** se renderiza "Ticket/alumno"
- **THEN** bajo el valor se ve "= vs mes anterior"

#### Scenario: mes anterior sin base

- **GIVEN** la academia no dictó clases el mes anterior
- **WHEN** se renderiza "Asistencia/clase"
- **THEN** no se muestra delta (solo el valor o "—")
