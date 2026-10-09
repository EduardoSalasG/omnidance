# Delta — academies/owner-insights

## ADDED Requirements

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

`GET /academies/:id/dashboard` SHALL incluir en `kpis` las mismas
métricas computadas sobre el tramo equivalente del mes anterior
(month-to-date: desde el día 1 hasta el mismo día transcurrido):
`billedMonthPrev`, `avgTicketMonthPrev` y
`avgAttendancePerClassMonthPrev` (null cuando el mes anterior no tiene
base — 0 clases dictadas o 0 pagos). Los KPIs sin histórico confiable
(`activeStudentsMonth`, `purchasablePlans`, `weeklyClasses`) MUST NOT
llevar comparativa.

La UI SHALL mostrar el delta porcentual bajo el valor del KPI cuando la
comparativa no es null, con formato "+N%" / "-N%" y leyenda "vs mes
anterior".

#### Scenario: facturación al alza

- **GIVEN** facturado MTD $900.000 y $600.000 en el mismo tramo del mes
  anterior
- **WHEN** se renderiza el KPI "Facturado"
- **THEN** bajo el valor se ve "+50% vs mes anterior"

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

## MODIFIED Requirements

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
