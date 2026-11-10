# analytics/query-console Specification

## Purpose
Motor de consultas compartido entre Analítica (solo lectura) y los módulos
operativos (interactivos): un catálogo único de entidades y filtros por
lente de rol, ejecución con scoping por ownership, preview en tabla,
export CSV/PDF y consultas guardadas. Generaliza el explorador de datos
que hoy solo existe para admin (`/admin/browse` + `/admin/datos`) y absorbe
los exports del productor.

## Requirements

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

### Requirement: Ejecución de consulta con scoping

El sistema SHALL exponer `POST /query/run`
(`{role, entity, filters, page?, pageSize?}`) que devuelve
`{headers, rows, total, page, pageSize, summary}` con `rows`
correspondientes a la página pedida y `total` real del resultado.
`page` se clampea a ≥1 y `pageSize` a [1,100] (default 50). El motor
aplica el scoping del lente automáticamente: PRODUCER solo ve registros
de eventos/series propios, ACADEMY_OWNER solo los de academias propias,
ADMIN ve todo. Ningún filtro permite saltarse el scoping (un `eventId`
ajeno devuelve vacío, nunca los datos). Filtros fuera del whitelist de
la entidad se ignoran; valores inválidos para filtros enum → 400.

#### Scenario: scoping del productor

- **GIVEN** dos productores A y B con eventos propios
- **WHEN** A ejecuta `entity=sales` con `eventId` de un evento de B
- **THEN** el resultado es vacío (no 403 con datos, no error que revele
  existencia arbitraria más allá del scope ya listado en su catálogo)

#### Scenario: filtro enum inválido

- **WHEN** `entity=sales` con `status=FOO` → 400

### Requirement: Export unificado CSV/PDF

El sistema SHALL exponer `GET /query/export.csv` y
`GET /query/export.pdf` con los mismos params de consulta (`role`,
`entity`, filtros). La descarga es `attachment` y contiene **el resultado
completo** de la consulta (sin el cap del preview) usando la misma fuente
de datos que `/query/run`: mismas columnas y filas. CSV: `text/csv`,
BOM UTF-8, escaping es-CL. PDF: reporte A4 con título, resumen, header
repetido y «Página X de Y».

#### Scenario: paridad preview/export

- **WHEN** se ejecuta una consulta y luego se exporta con los mismos
  filtros → el archivo contiene todas las filas que `total` reportó

#### Scenario: export sin sesión o sin lente → 401/403

### Requirement: Consultas guardadas

El sistema SHALL persistir consultas por usuario y lente
(`SavedReport`: personId, role, name, params JSON con entity+filtros+scope)
y exponer `GET /query/saved?role=`, `POST /query/saved`,
`PATCH /query/saved/:id` (renombrar) y `DELETE /query/saved/:id`.
`params` se valida contra el catálogo (entity/filtros conocidos) → 400 si
es inválido. Un usuario solo lista/edita/borra las suyas. El sistema
además SHALL ofrecer consultas predefinidas por lente (plantillas del
sistema: ej. "Ventas", "Check-ins", "Lista de invitados" en PRODUCER) que
no se guardan en DB ni se pueden borrar.

#### Scenario: guardar y reutilizar

- **GIVEN** el usuario definió filtros en Consultas
- **WHEN** los guarda con nombre "Cierre octubre"
- **THEN** `GET /query/saved?role=PRODUCER` la lista y al seleccionarla la
  barra de filtros se re-carga con sus valores

#### Scenario: aislamiento por usuario

- **WHEN** otro usuario pide la consulta guardada de alguien más
  (GET/PATCH/DELETE por id) → 404 (no 403: no se revela existencia)

### Requirement: Página Consultas en /analitica

`/analitica` SHALL tener sub-navegación interna entre **Dashboard**
(contenido actual: KPIs y secciones por lente) y **Consultas**. La página
Consultas SHALL renderizar la barra de filtros data-driven desde el
catálogo (select de entidad, scope, rango de fechas con presets, filtros
propios de la entidad), ejecutar preview al aplicar, ofrecer export
CSV/PDF y guardar la consulta actual, y listar las consultas guardadas
(sistema + propias) que al elegirse precargan los filtros. En lentes sin
entidades consultables la página muestra solo el Dashboard.

#### Scenario: flujo completo

- **GIVEN** un productor en `/analitica/consultas` con lente PRODUCER
- **WHEN** elige entidad `sales`, su evento, rango últimos 30 días y
  estado ACTIVE → aplica
- **THEN** ve la tabla preview con total real y puede descargar CSV/PDF o
  guardar la consulta

#### Scenario: paginación del preview

- **WHEN** el resultado excede el pageSize
- **THEN** la tabla muestra el `Pager` compartido y cambiar de página
  re-ejecuta `/query/run` con el `page` pedido manteniendo filtros;
  cambiar entidad o filtros vuelve a página 1

### Requirement: Contrato de filtros compartido con módulos

Las páginas de lista de los módulos de gestión (academia: alumnos,
asistencia, clases, cobros, particulares, planes, series; productor:
eventos, listas, pagos, comprobantes, códigos; admin: usuarios, datos,
finanzas, auditoría, campañas) SHALL usar el mismo componente de barra de
filtros y los mismos params/semántica que declara el catálogo para la
entidad equivalente. Los endpoints de lista SHALL aceptar esos params
(filtros inválidos → 400; desconocidos ignorados). La única diferencia
funcional: las listas de módulo conservan sus acciones por fila
(editar/cambiar estado/etc.); Consultas es solo lectura + export.

#### Scenario: mismo filtro, dos contextos

- **WHEN** el dueño de academia filtra por `status=ACTIVE` en
  `/academia/alumnos` y en `/analitica/consultas` (entity `students`)
- **THEN** ambos usan el mismo param y la misma semántica; en alumnos las
  filas siguen siendo accionables

### Requirement: Gate Producer Pro

Las entidades del lente PRODUCER (catálogo, run y export) SHALL requerir
Producer Pro efectivo del owner consultado; misma regla que los exports
actuales (`403` con el contrato unificado `tier.required`). Los lentes
ACADEMY_OWNER y ADMIN no tienen gate adicional al de rol aprobado.

#### Scenario: productor sin Pro

- **GIVEN** un PRODUCER aprobado sin Pro efectivo
- **WHEN** ejecuta `/query/run` o `/query/export.*` con role=PRODUCER
- **THEN** responde 403 `tier.required` (requiredTier PRO, feature
  analytics|exports según la operación) y la UI muestra el paywall

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

### Requirement: Ficha de persona con listas acotadas

Las listas de la ficha `/analitica/usuarios/[personId]` (productores,
academias por rol, historial de roles, desgloses por academia/estilo/
género, enrollments activas) SHALL usar preview + "Ver todo" con el
componente compartido, y las referencias a actores con ficha propia
(productor, academia, venue) SHALL ser `<Link>` cuando el payload
trae el id.

#### Scenario: desglose por academia expandible

- **GIVEN** un bailarín con actividad en 12 academias
- **WHEN** se abre su ficha de analítica
- **THEN** el desglose muestra 5 filas + "Ver todo (12)"

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

Las opciones SHALL excluir registros eliminados: series y slots con
`deletedAt` no nulo, y slots/clases cuya serie fue borrada. Cuando dos
opciones comparten el mismo nombre, el label SHALL incluir contexto
que las desambigüe (en series, su horario abreviado).

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

#### Scenario: series borradas no aparecen como opción

- **GIVEN** una academia con series soft-deleted
- **WHEN** pide `/query/options?source=academyClassSeries` (con o sin
  `scopeId`)
- **THEN** el select solo lista las series activas; los slots y clases
  cuya serie fue borrada tampoco aparecen en sus fuentes

#### Scenario: series homónimas distinguibles por horario

- **GIVEN** una academia con dos series activas llamadas "Partnerwork"
- **WHEN** abre el filtro de serie
- **THEN** las opciones se leen "Partnerwork · mié 21:30" y
  "Partnerwork · jue 20:30" (o el horario que corresponda)

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

### Requirement: Selects FK en cascada

Los filtros FK de una entidad SHALL declarar sus dependencias de
opciones en `FilterDef.dependsOn`. La cascada es acumulativa: las
opciones respetan TODOS los filtros padre elegidos aunque haya niveles
intermedios sin selección. Cuando un filtro padre cambia, la barra de
filtros SHALL re-pedir `/query/options` con los valores actuales de
los padres y SHALL limpiar la selección de los dependientes en cadena
transitiva. Sin padre elegido, las opciones son las del scope
completo.

En `attendance` (lente ACADEMY_OWNER) el orden es nivel → serie →
horario, con instructor acotado por serie y por horario. No hay select
de clase: la ocurrencia concreta se alcanza con horario + rango de
fechas.

#### Scenario: nivel acota el select de serie

- **GIVEN** un owner en la entidad `attendance` con un nivel elegido
- **WHEN** abre el select de serie
- **THEN** solo ve las series de ese nivel

#### Scenario: nivel acota horario sin serie elegida

- **GIVEN** un nivel elegido y el select de serie en "Todos"
- **WHEN** abre el select de horario
- **THEN** solo ve los horarios de las series de ese nivel

#### Scenario: serie acota horario, horario acota clase e instructor

- **GIVEN** una serie elegida
- **WHEN** abre el select de horario
- **THEN** solo ve los horarios de esa serie
- **AND** con un horario elegido, el de instructor solo ofrece el
  instructor del slot

#### Scenario: serie sin horario acota instructor

- **GIVEN** una serie elegida y el select de horario en "Todos"
- **WHEN** abre el select de instructor
- **THEN** ofrece solo el instructor titular de la serie

#### Scenario: cambiar el padre limpia dependientes

- **WHEN** el usuario cambia el nivel tras haber elegido serie y
  horario
- **THEN** serie y horario vuelven a "Todos"

### Requirement: Entidad `acquisition` del lente ADMIN

El catálogo del lente ADMIN SHALL incluir la entidad `acquisition`
(reporte de altas por canal de adquisición). Cada fila del resultado
corresponde a UN canal con su conteo de altas y porcentaje del total;
el resultado se ordena por altas descendente y el canal como
desempate. Las columnas SHALL ser `canal`, `altas`, `pct`. La entidad
SHALL declarar los filtros `from`/`to` (rango sobre `Person.createdAt`,
misma semántica de fechas que el resto de entidades) y `kind`
(enum multi por prefijo de canal).

El canal de un alta SHALL resolverse así: si la persona tiene una fila
`Referral` como referida, el canal es la fuente de esa referral en
minúsculas (`invite`, `gift_ticket`, `link`); si no, es
`Person.acquisitionSource` tal como quedó persistida
(`utm:<source>`, `ref:<host>`, `landing:<path>`, `direct`); si tampoco
existe, `sin_dato`. Cuando una persona tenga más de una fila Referral
SHALL usarse la más antigua.

El filtro `kind` SHALL aceptar los valores `utm`, `ref`, `landing`,
`direct`, `invite`, `gift_ticket`, `link`, `none` (selección múltiple
CSV igual que otros filtros enum multi); un valor fuera de la
whitelist SHALL responder 400. `utm` agrupa todo canal
`utm:*`; `ref` todo `ref:*`; `landing` todo `landing:*`; `direct` el
canal `direct`; `invite|gift_ticket|link` los canales de referral;
`none` agrupa `sin_dato`.

La entidad es agregada: las filas SHALL no llevar `personId` de
sujeto (sin drill a ficha de persona). `total` SHALL ser la cantidad
de canales en el resultado (tras filtros), y el `summary` SHALL
informar las altas totales del período y la cantidad de canales.

#### Scenario: reporte por canal del período

- **GIVEN** en el rango elegido hubo altas: 3 con
  `acquisitionSource=utm:instagram`, 2 `direct`, 1 referida por
  INVITE y 1 sin dato
- **WHEN** ADMIN ejecuta `entity=acquisition` con `from`/`to`
- **THEN** las filas son `utm:instagram` (3), `direct` (2), `invite`
  (1), `sin_dato` (1), en ese orden, cada una con su pct del total
  (7) y `total` = 4 canales

#### Scenario: referral gana a acquisitionSource nulo

- **GIVEN** una persona creada por token de invite (acquisitionSource
  null) que además tiene fila Referral INVITE
- **WHEN** se ejecuta la entidad
- **THEN** el alta cuenta en el canal `invite`, no en `sin_dato`

#### Scenario: filtro kind por prefijo

- **WHEN** se ejecuta con `kind=utm,ref`
- **THEN** solo aparecen filas de canales `utm:*` y `ref:*`

#### Scenario: kind inválido

- **WHEN** se ejecuta con `kind=foo` → 400
