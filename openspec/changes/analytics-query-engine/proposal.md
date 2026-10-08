# Proposal — analytics-query-engine

## Why

Los exports del productor (ventas/check-ins/invitados) viven aislados en el
detalle del evento sin filtros; `/admin/datos` ya implementa un explorador
de datos por entidad con filtros whitelist, pero solo para admin y sin
export ni persistencia; y las páginas de módulos (academia/productor/admin)
tienen filtros ad-hoc, inconsistentes o inexistentes. Se unifica todo en un
motor de consultas compartido: mismo catálogo de entidades+filtros, misma
UI, scoping por rol, preview, export CSV/PDF y consultas guardadas —
analítica es solo-lectura, los módulos reutilizan los mismos filtros sobre
sus listas interactivas.

## What Changes

- **`/analitica` pasa a ser un módulo con dos páginas**: Dashboard (contenido
  actual: KPIs + secciones por lente) y **Consultas** (nueva): barra de
  filtros por entidad → preview en tabla (primeras ~50 filas + total) →
  export CSV/PDF → guardar consulta. Sub-nav interna entre ambas.
- **Motor de consultas compartido** (API): las queries por entidad de
  `BrowseController` se extraen a un query engine reusable con **scoping por
  rol inyectado** (admin=global, producer=sus eventos, academy=sus academias).
  `/admin/browse` sigue vivo delegando al engine (back-compat).
- **Catálogo data-driven**: `GET /query/catalog?role=` devuelve por lente las
  entidades disponibles, sus filtros declarados (key, tipo, opciones/fuente)
  y columnas. La UI no hardcodea nada.
- **Datasets nuevos por lente**: producer suma attendees/reservations/
  waitlist/rsvps; academy_owner recibe students/attendance/bookings/
  memberships/payments/private_lessons; admin extiende el set actual de
  browse (events/payments/payouts/people/…).
- **Filtros transversales**: `from`/`to` + enums por entidad (status, canal,
  método, orderType…) + `q` + FK selects — mismos nombres/semántica en
  Consultas y en los endpoints de módulo.
- **Exports unificados**: `GET /query/export.{csv,pdf}?role=&entity=&…filtros`
  construye `{headers, rows, summary}` con el mismo engine; el preview usa
  `POST /query/run` (JSON). Los endpoints `GET /events/:id/export.*` y
  `GET /events/series/:id/export.*` se mantienen delegando (back-compat).
- **Consultas guardadas**: tabla `SavedReport` (personId, role, name, params
  JSON validado por zod) + CRUD `GET|POST|PATCH|DELETE /query/saved` +
  plantillas de sistema por lente (los exports actuales como presets).
- **Refactor de filtros en TODOS los módulos**: componente `FilterBar`
  compartido data-driven por el catálogo; las páginas de lista de academia
  (alumnos, asistencia, clases, cobros, particulares, planes, series…),
  productor (eventos, listas, pagos, comprobantes, códigos) y admin
  (usuarios, datos, finanzas, auditoría, campañas…) adoptan el componente y
  sus endpoints de lista aceptan los params estándar del catálogo. Los
  módulos conservan sus acciones por fila (la diferencia con Consultas es
  solo lectura vs interacción).
- **UI**: `/admin/datos` migra a los componentes compartidos; `ExportSection`
  sale de `/productor/eventos/[id]`.
- **Gates**: producer exports/consultas siguen tras Producer Pro
  (`403 pro.required`); academy/admin sin gate extra al existente de rol.

## Capabilities

### New Capabilities

- `analytics/query-console`: motor de consultas compartido — catálogo por
  rol, scoping/ownership, preview, export CSV/PDF, consultas guardadas,
  y la regla de que los módulos y Consultas usan el mismo contrato de
  filtros (módulos = interactivos, Consultas = solo lectura).

### Modified Capabilities

- `events/producer-export`: los exports aceptan filtros opcionales
  (`from`/`to`/status/etc.) vía el engine compartido; endpoints existentes
  se conservan como adaptadores. (La UI de export se traslada del detalle
  del evento a `/analitica/consultas` - la spec no fija ubicación de UI.)

## Impact

- **API**: nuevo `src/query/` (engine + controller + saved) o extensión de
  `analytics`; refactor de `admin/infrastructure/browse.controller.ts`
  (extracción, endpoints intactos); refactor de export en
  `events/infrastructure/events.controller.ts`; params nuevos en endpoints
  de lista de `academies`, `events`, `admin` controllers.
- **DB**: tabla `SavedReport` (migración versionada).
- **Shared**: contratos zod de query params, catálogo de entidades/filtros,
  plantillas de consultas del sistema.
- **Web**: `/analitica` (sub-nav + consultas), `components/query/`
  (FilterBar, QueryTable, SavedQueries), refactor de `admin/datos` y de las
  páginas de lista de módulos; i18n en `parts/` nuevo `query.json`.
- **Authz**: scoping por rol en el engine; producer Pro gate preservado.
- **Docs**: `docs/architecture.md`, `docs/flows.md`, `docs/openapi.json` +
  colección Postman regeneradas.
