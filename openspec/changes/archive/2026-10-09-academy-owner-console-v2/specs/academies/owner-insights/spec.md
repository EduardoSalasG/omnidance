# Delta — academies/owner-insights

## MODIFIED Requirements

### Requirement: Comparativa de KPIs del mes

`GET /academies/:id/dashboard` SHALL incluir en `kpis` las métricas
comparables computadas sobre el tramo equivalente del mes anterior
(month-to-date: desde el día 1 hasta el mismo día transcurrido):
`activeStudentsMonthPrev`, `billedMonthPrev`, `avgTicketMonthPrev` y
`avgAttendancePerClassMonthPrev` (null cuando el mes anterior no tiene
base — 0 clases dictadas o 0 pagos).

`activeStudentsMonth` SHALL contar **personas únicas** (`personId`) con
enrollment en estado que habilita asistir (ACTIVE, TRIAL, ONLINE) y
vigencia no vencida (`endsAt` null o ≥ hoy). `activeStudentsMonthPrev`
SHALL contar personas únicas con enrollment en ese set de estados cuya
vigencia intersecta el tramo MTD del mes anterior (`startedAt` ≤ fin del
tramo y `endsAt` null o ≥ inicio del mes anterior). Como no existe
histórico de estados, la comparativa usa el estado actual del
enrollment como aproximación.

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

## ADDED Requirements

### Requirement: Composición por género del alumnado activo

`GET /academies/:id/dashboard` SHALL incluir en `kpis`
`pctMenMonth` y `pctWomenMonth`: porcentaje entero (0–100) de personas
con `gender` M (resp. F) sobre el total de alumnos activos únicos del
mes; `null` cuando no hay alumnos activos. El denominador incluye
alumnos sin género declarado u `OTHER`, por lo que ambos porcentajes
pueden no sumar 100.

También SHALL incluir `pctMenMonthPrev` y `pctWomenMonthPrev`
computados sobre el set de alumnos del tramo MTD del mes anterior
(misma definición que `activeStudentsMonthPrev`); `null` sin base.

#### Scenario: plantel mixto

- **GIVEN** 10 alumnos activos únicos: 6 con gender F, 3 con M y 1 sin
  declarar
- **WHEN** se consulta el dashboard
- **THEN** `pctWomenMonth` es 60 y `pctMenMonth` es 30

#### Scenario: sin alumnos

- **GIVEN** una academia sin alumnos activos
- **WHEN** se consulta el dashboard
- **THEN** `pctMenMonth` y `pctWomenMonth` son null y las cards
  muestran "—"

### Requirement: KPIs del módulo de alumnos

La página `/academia/alumnos` SHALL mostrar como primera sección solo
las cards `Alumnos activos`, `% mujeres` y `% hombres` del strip de
KPIs, cada una con su comparativa del mes anterior. El resto de los
KPIs del dashboard MUST NOT aparecer en ese módulo.

#### Scenario: strip reducido

- **GIVEN** el dashboard de una academia con datos
- **WHEN** el owner abre `/academia/alumnos`
- **THEN** ve exactamente 3 cards de KPI: alumnos activos, % mujeres y
  % hombres
