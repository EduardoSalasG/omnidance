# academies/owner-insights Specification

## Purpose
TBD - created by archiving change academy-operations-insights. Update Purpose after archive.

## Requirements

### Requirement: Directorio público mínimo de academias

`GET /academies/public` SHALL responder sin sesión la lista de
academias activas (`active: true` y sin `billingBlockedAt`) con solo
`{id, name, styles}` — los estilos se derivan de sus series activas,
deduplicados y ordenados alfabéticamente. MUST NOT exponer dirección,
instructores, métricas ni datos de alumnos.

#### Scenario: respuesta mínima

- **WHEN** un cliente anónimo consulta `GET /academies/public`
- **THEN** recibe 200 con `{id, name, styles: [{id, name}]}` por
  academia activa, ordenadas por nombre
- **AND** academias inactivas o bloqueadas por mora no aparecen

### Requirement: Planes por vencer en el dashboard

`GET /academies/:id/dashboard` SHALL incluir `expiringEnrollments`:
inscripciones con status ACTIVE, TRIAL u ONLINE cuyo `endsAt` cae entre
hoy y `academy.insights.expiring_days` (param, default 14) días
adelante, ordenadas por `endsAt` ascendente. Cada ítem SHALL incluir
`{personId, personName, planName, status, endsAt}`; `planName` es null
si la inscripción no tiene plan.

#### Scenario: alumno con plan por vencer

- **GIVEN** una inscripción ACTIVE con `endsAt` en 10 días
- **WHEN** el owner consulta el dashboard
- **THEN** `expiringEnrollments` la lista con nombre, plan y fecha

#### Scenario: filtros de la lista

- **WHEN** una inscripción tiene `endsAt` null, ya vencido, más allá de
  la ventana, o status PAUSED/FROZEN
- **THEN** no aparece en `expiringEnrollments`

### Requirement: Cumpleaños próximos en el dashboard

`GET /academies/:id/dashboard` SHALL incluir `upcomingBirthdays`:
personas con al menos una inscripción en la academia cuyo próximo
cumpleaños (día/mes de `birthDate`, ignorando el año) cae dentro de
`academy.insights.birthday_days` (param, default 30) días, ordenadas
por días restantes. Cada ítem SHALL incluir `{personId, name, date}`
donde `date` es el día/mes del cumpleaños de este año (o del siguiente
si ya pasó); el año de nacimiento MUST NOT exponerse. Una persona con
varias inscripciones aparece una sola vez.

#### Scenario: cumpleaños dentro de la ventana

- **GIVEN** un alumno con `birthDate` 15 de marzo y hoy es 1 de marzo
- **WHEN** el owner consulta el dashboard
- **THEN** `upcomingBirthdays` lo lista con `date` 15 de marzo

#### Scenario: cambio de año

- **GIVEN** un alumno con `birthDate` 5 de enero y hoy es 20 de
  diciembre
- **WHEN** el owner consulta el dashboard
- **THEN** lo lista con `date` 5 de enero del año siguiente

#### Scenario: sin birthDate

- **WHEN** un alumno no declaró `birthDate`
- **THEN** no aparece en `upcomingBirthdays`

### Requirement: Listas de insights en la consola

La consola del owner SHALL mostrar los insights de retención en listas
divididas con tope de 6 filas visibles por sección y footer "Ver todos
(N)" al módulo correspondiente cuando hay más:

- "Planes que vencen hoy": ítems de `expiringEnrollments` con `endsAt`
  de hoy.
- "Planes que vencen esta semana": ítems con `endsAt` dentro de los
  próximos 7 días (excluido hoy). Los ítems más allá de 7 días dentro
  de la ventana se contabilizan en el footer sin listarse.
- "Próximos cumpleaños": `upcomingBirthdays`.

Cada fila SHALL enlazar a la ficha del alumno
(`/academia/alumnos/[personId]`). Secciones vacías MUST NOT
renderizarse.

#### Scenario: vencen hoy y esta semana

- **WHEN** hay 1 plan que vence hoy y 4 en los próximos 7 días
- **THEN** se ven dos secciones separadas con 1 y 4 filas

#### Scenario: renderizado condicional

- **WHEN** hay 2 planes por vencer esta semana y ningún cumpleaños
  próximo
- **THEN** se ve "Planes que vencen esta semana" con 2 filas y no
  existe la sección de cumpleaños

### Requirement: Cobros por revisar en el dashboard

`GET /academies/:id/dashboard` SHALL incluir `pendingClaims` con el
agregado de `PaymentClaim` en estado PENDING de la academia:
`{count, amount}` (suma de `amount` declarado) e `items` con hasta 5
claims ordenados por `createdAt` ascendente (los más antiguos primero),
cada uno `{personId, personName, amount, createdAt}`.

La consola del owner SHALL mostrar una sección "Cobros por revisar" en
la columna operativa cuando `count > 0`, con el total pendiente en el
encabezado, cada fila enlazando a `/academia/cobros`, y footer "Ver
todos" cuando `count` supera los ítems mostrados. Con `count = 0` la
sección MUST NOT renderizarse.

#### Scenario: hay claims pendientes

- **GIVEN** 3 claims PENDING por $10.000, $20.000 y $15.000
- **WHEN** el owner consulta el dashboard
- **THEN** `pendingClaims` reporta `{count: 3, amount: 45000}` y la
  sección muestra las filas y el total

#### Scenario: sin pendientes

- **WHEN** no hay claims PENDING
- **THEN** `pendingClaims.count` es 0 y la sección no existe en la UI

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

### Requirement: Checklist de activación de academia

Mientras la academia no tenga alumnos (`totalStudents = 0`), la consola
SHALL mostrar una checklist "Primeros pasos" con las acciones de
puesta en marcha marcadas según el estado real: serie y horario creados
(`weeklyClasses > 0`), plan comprable (`plansCount > 0`), primer alumno
(`totalStudents > 0`) y equipo invitado (`teamCount > 0`). Cada paso
SHALL enlazar a su módulo. Con al menos un alumno la checklist MUST NOT
renderizarse.

#### Scenario: academia recién creada

- **GIVEN** una academia sin alumnos ni series ni planes
- **WHEN** el owner abre /inicio
- **THEN** ve la checklist con todos los pasos sin marcar, cada uno
  enlazando a su módulo

### Requirement: Team count en el dashboard

`GET /academies/:id/dashboard` SHALL incluir `teamCount`: cantidad de
`AcademyStaff` + `AcademyInstructor` de la academia (insumo del
checklist de activación).

#### Scenario: equipo de dos

- **GIVEN** una academia con 2 colaboradores y 1 profesor
- **WHEN** se consulta el dashboard
- **THEN** `teamCount` es 3

### Requirement: Clases de hoy enlazables con estado vacío

La sección "Hoy" SHALL enlazar cada clase del día a
`/academia/asistencia` (el módulo donde se marca asistencia). Cuando no
hay clases hoy la sección SHALL mostrar el estado vacío "Hoy no hay
clases" con link a `/academia/horarios`, en vez de desaparecer.

#### Scenario: día sin clases

- **WHEN** `todayClasses` está vacío
- **WHEN** el owner abre la consola
- **THEN** ve "Hoy no hay clases" con acceso al módulo de horarios

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
