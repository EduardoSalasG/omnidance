# Delta: analytics/query-console

## ADDED Requirements

### Requirement: Fuentes FK de academia resolubles sin scope explícito

Las fuentes FK del lente ACADEMY_OWNER (`academyPlans`,
`academyClassSeries`, `academyInstructors`, `academyScheduleSlots`,
`academyClasses`) SHALL resolverse en `GET /query/options` aunque
`scopeId` venga vacío: en ese caso la respuesta es la unión de las
opciones de todas las academias propias del actor, con la misma
semántica de scope que `/query/run` (`academyId` ausente = todas las
propias). Con `scopeId` informado se conserva la validación de
ownership (ajeno → lista vacía, nunca 403 ni datos de otro). Cuando el
actor posee más de una academia los labels SHALL llevar el sufijo
`· {nombre de la academia}` y las opciones se deduplican por `value`.

Un `FilterDef` puede declarar `requiresScope: true`: la barra de
filtros SHALL omitir la resolución sin scope para esas fuentes
(`eventGuestLists` sigue exigiendo `scopeId` → 400 sin él).

#### Scenario: owner de una academia ve sus planes sin elegirla

- **GIVEN** un owner con una sola academia y el filtro Academia en
  "Todas"
- **WHEN** abre el select Plan de la entidad `students`
- **THEN** la UI pidió `/query/options?source=academyPlans&scopeId=` y
  el select lista los planes de su academia

#### Scenario: owner multi-academia sin scope

- **GIVEN** un owner con dos academias
- **WHEN** pide `/query/options?source=academyInstructors` sin
  `scopeId`
- **THEN** recibe los instructores de ambas, cada label con sufijo
  `· {academia}`, sin valores duplicados

#### Scenario: scopeId ajeno sigue vacío

- **WHEN** pide `/query/options?source=academyPlans&scopeId=<ajena>`
- **THEN** `{options: []}` (sin revelar existencia)

### Requirement: Filtros de horario y clase en asistencia

La entidad `attendance` del lente ACADEMY_OWNER SHALL declarar los
filtros `slotId` (fk `academyScheduleSlots`, opciones
`{serie} · {día} {hora}` de los ClassSlot de la academia, incluidos
los con borrado lógico por su historial) y `classId` (fk
`academyClasses`, opciones `{serie} · {fecha} {hora}` de las Class más
recientes de la academia, cap 300). Ambos SHALL aplicarse en run/export:
`slotId` filtra `Class.classSlotId` y `classId` filtra
`Attendance.classId`; valores ajenos producen vacío, nunca 403.

#### Scenario: asistencia de un horario

- **GIVEN** un owner con asistencias en varios horarios
- **WHEN** aplica `slotId=<slot>` en `attendance`
- **THEN** solo ve asistencias de clases materializadas de ese slot

#### Scenario: asistencia de una clase concreta

- **WHEN** aplica `classId=<clase>`
- **THEN** solo ve las asistencias de esa ocurrencia

### Requirement: Formato legible de celdas del preview

La tabla del preview (`QueryTable`, solo front - el CSV/PDF conserva
ISO) SHALL normalizar las celdas: un string `YYYY-MM-DD` o un ISO a
medianoche UTC (`T00:00:00Z`, convención día-calendario de `Class.date`)
se muestra como fecha del locale en UTC; el resto de ISO como
fecha+hora del locale en zona local; un string que coincida con una
clave de `query.optionLabels` se muestra traducido (incluye
`PLATFORM_CHARGE` y `PRIVATE`, valores reales de `Payment.orderType`).

#### Scenario: fechas y estados legibles

- **GIVEN** una fila de `students` con `inicio` ISO y `estado` ACTIVE
- **WHEN** se renderiza el preview
- **THEN** `inicio` sale formateado es-CL y `estado` como "Activo"

## MODIFIED Requirements

### Requirement: Drill-down a ficha de persona desde resultados

Cuando una fila de la tabla de resultados de `/analitica` expone un
`personId` (sujeto persona de la entidad consultada), la celda
correspondiente SHALL ser un `<Link>` a la ficha persona del contexto
del lente: `/academia/alumnos/[personId]` en lente ACADEMY_OWNER y
`/analitica/usuarios/[personId]` en PRODUCER/ADMIN. Las entidades sin
persona identificable quedan como texto.

#### Scenario: resultado con persona navegable

- **GIVEN** una consulta de ACADEMY_OWNER cuya fila trae `personId`
- **WHEN** se renderiza la tabla de resultados
- **THEN** la celda del alumno linkea a `/academia/alumnos/[personId]`

#### Scenario: lente admin conserva la ficha de analítica

- **GIVEN** una consulta de ADMIN con `personId`
- **WHEN** se renderiza la tabla
- **THEN** la celda linkea a `/analitica/usuarios/[personId]`

### Requirement: Catálogo de consultas por lente

El sistema SHALL exponer `GET /query/catalog?role=<lente>` que devuelve,
para el lente solicitado, la lista de entidades consultables y por cada
una: sus filtros declarados (`key`, tipo `enum|text|date|fk`, opciones
estáticas o fuente de opciones, `requiresScope` cuando la fuente lo
exige) y sus columnas de resultado. Lentes con consultas: `PRODUCER`,
`ACADEMY_OWNER`, `ADMIN`. El lente debe estar aprobado para el usuario
(misma regla que `GET /analytics/summary`). La entidad `bookings`
(reservas de clase) SHALL no exponerse en el lente ACADEMY_OWNER: su
gestión vive en las fichas de clase de la consola.

#### Scenario: catálogo del productor

- **GIVEN** un usuario con rol PRODUCER aprobado
- **WHEN** pide `GET /query/catalog?role=PRODUCER`
- **THEN** recibe las entidades del lente (al menos `sales`, `checkins`,
  `guestlist`, `attendees`, `reservations`, `waitlist`, `rsvps`) con los
  filtros declarados de cada una y las opciones de scope (sus eventos y
  series)

#### Scenario: lente no autorizado

- **WHEN** pide el catálogo de un rol que no tiene aprobado o que no
  existe → 403

#### Scenario: bookings fuera del lente academia

- **GIVEN** un ACADEMY_OWNER aprobado con la feature `analytics`
- **WHEN** pide su catálogo o ejecuta `/query/run` con `entity=bookings`
- **THEN** el catálogo no la lista y run responde 400 `entity inválido`
