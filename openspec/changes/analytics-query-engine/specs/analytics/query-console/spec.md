# analytics/query-console Specification

## Purpose

Motor de consultas compartido entre Analítica (solo lectura) y los módulos
operativos (interactivos): un catálogo único de entidades y filtros por
lente de rol, ejecución con scoping por ownership, preview en tabla,
export CSV/PDF y consultas guardadas. Generaliza el explorador de datos
que hoy solo existe para admin (`/admin/browse` + `/admin/datos`) y absorbe
los exports del productor.

## ADDED Requirements

### Requirement: Catálogo de consultas por lente

El sistema SHALL exponer `GET /query/catalog?role=<lente>` que devuelve,
para el lente solicitado, la lista de entidades consultables y por cada
una: sus filtros declarados (`key`, tipo `enum|text|date|fk`, opciones
estáticas o fuente de opciones) y sus columnas de resultado. Lentes con
consultas: `PRODUCER`, `ACADEMY_OWNER`, `ADMIN`. El lente debe estar
aprobado para el usuario (misma regla que `GET /analytics/summary`).

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
Producer Pro efectivo del owner consultado — misma regla que los exports
actuales (`403` con `pro.required`). Los lentes ACADEMY_OWNER y ADMIN no
tienen gate adicional al de rol aprobado.

#### Scenario: productor sin Pro

- **GIVEN** un PRODUCER aprobado sin Pro efectivo
- **WHEN** ejecuta `/query/run` o `/query/export.*` con role=PRODUCER
- **THEN** responde 403 `pro.required` y la UI muestra el paywall
