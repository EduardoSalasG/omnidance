# Design — analytics-query-engine

## Context

Ver proposal.md → Why. Piezas existentes que se reusan:

- `admin/infrastructure/browse.controller.ts` (803 líneas): 12 entidades con
  queries Prisma + filtros whitelist + cap de filas. Es el patrón a
  generalizar, hoy acoplado a admin.
- `events.controller.ts`: exports CSV/PDF (`exportSales/Checkins/Guestlist`,
  `toCsv`, `csvCell`, PDF via pdfkit) como métodos privados.
- `datos/page.tsx` (975 líneas): catálogo de filtros hardcodeado en cliente
  (`ENTITY_PARAMS`, `STATIC_OPTIONS`, `FILTER_SOURCES`) + row renderers.
- Scoping de lentes ya existe en `AnalyticsService.availableRoles`.
- Gate Producer Pro: `pro.required` 403 ya implementado en exports.

## Goals / Non-Goals

**Goals**: un query engine compartido (catálogo → filtros → filas →
preview/export), Consultas en `/analitica`, consultas guardadas en DB,
mismo contrato de filtros en módulos.

**Non-goals**: charts nuevos en Consultas (el dashboard ya tiene
visualizaciones; consultas es tabla+export); paginación cursorial del
preview (cap fijo + total alcanza para el slice); consultas públicas o
compartidas entre usuarios; reescribir row-rendering de los módulos (solo
la barra de filtros y los params).

## Decisions

### D1 — Catálogo estático en shared, opciones resueltas por API

Las entidades y sus filtros (key, tipo, opciones enum estáticas o fuente
FK) se declaran **una vez en `packages/shared`** (`query-catalog.ts`) como
datos puros + zod. `GET /query/catalog?role=` = catálogo estático filtrado
por lente + opciones FK resueltas server-side (eventos/series/academias del
actor; producers/venues/etc. para admin).

*Por qué*: las páginas de módulo necesitan los descriptores de filtro sin
hacer fetch ni pedir role explícito; hardcodear una segunda copia en el
cliente (lo que hoy hace `datos/page.tsx`) es exactamente la divergencia
que se quiere eliminar.

### D2 — Engine = registry de entidades con scoping inyectado

`src/query/query.service.ts` mantiene un registry `entity → {filters,
buildQuery(scope, filters) → rows, columns}`. Cada entidad declara su
`scopeWhere(role, personId)` (admin: `{}`; producer: `{event.producerId}`
o equivalente; academy: `{academyId ∈ owned}`). Los filtros se traducen a
`where` por la entidad vía whitelist — nunca se acepta `where` arbitrario.

Las queries de `BrowseController` se extraen a `src/query/entities/*.ts`
(funciones puras que reciben prisma + scope + filters). `BrowseController`
delega al registry con scope admin → comportamiento idéntico, tests de
regresión mínimos.

### D3 — Exports = misma construcción de filas, dos serializadores

Los builders de `events.controller` (`exportSales/Checkins/Guestlist` +
`toCsv` + PDF) se mueven al engine como datasets del lente PRODUCER. Los
endpoints `/events/:id/export.*` quedan como adaptadores finos (resuelven
scope evento/serie → llaman al engine) — el spec `producer-export` queda
intacto y gana filtros opcionales.

`POST /query/run` y `GET /query/export.*` comparten el mismo
`buildRows()`; run capea `rows` (preview 50 + `total`), export envía todo.
PDF reutiliza el serializador existente (A4, header repetido, paginación).

### D4 — SavedReport por persona+lente, params validados contra catálogo

```prisma
model SavedReport {
  id        String   @id @default(cuid())
  personId  String
  role      String   // PRODUCER | ACADEMY_OWNER | ADMIN
  name      String
  params    Json     // {entity, filters{...}, scope{...}} validado por zod
                     // contra el catálogo shared
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  @@index([personId, role])
}
```

Sin `@@unique` de nombre (permite homónimos; la UX los distingue por fecha).
Las plantillas de sistema viven en shared (`SYSTEM_QUERIES` por lente:
entity+filtros sin scope fijo) — no se persisten ni se borran.

### D5 — FilterBar compartido; módulos conservan su fetch

`components/query/FilterBar.tsx` recibe el descriptor de la entidad (del
catálogo shared) + valores + onChange; renderiza q (debounce), selects enum,
selects FK (opciones vía props/loader), fechas. **Las páginas de módulo
siguen pegándole a su endpoint actual** — el endpoint gana los params del
catálogo para su entidad (ej. `GET /academies/:id/students?status=&q=&from=&to=`).
Consultas sí usa `/query/run|export` (read-only).

*Por qué no* que los módulos consuman `/query/run`: sus listas tienen row
UI propia con acciones (mutaciones), shapes distintos al formato tabla del
engine. Compartir el contrato de filtros (params + componente) es la parte
con valor; compartir el row-fetch mezclaría lectura con escritura.

### D6 — Admin también por el engine

`/admin/datos` migra a `FilterBar` + `DataTable` sobre el catálogo
(admite row-renderer por entidad donde las filas no son tabulares, ej.
people/leads conservan su card) + export + guardadas. `/admin/browse`
sigue respondiendo igual (delega al engine).

## Risks / Trade-offs

- **Refactor de 20+ páginas de módulo** → riesgo de regresión visual.
  Mitigación: `FilterBar` es aditivo (páginas sin filtros ganan barra; las
  que tenían ad-hoc la reemplazan 1:1); revisión por página en el diff;
  smoke manual de las 3 consolas.
- **Endpoints de lista heterogéneos** (algunos devuelven shapes custom que
  el frontend ya pagina/agrupa) → añadir params puede ser invasivo.
  Mitigación: params opcionales y aditivos; el default sin params = comportamiento
  actual (back-compat garantizada).
- **Datasets nuevos de academy** (attendance/bookings/memberships) tocan
  dominios con reglas propias (créditos, cuotas) → solo lectura de campos
  existentes, sin interpretación de negocio en el export.
- **Tamaño del change** → división en workstreams (ver tasks); los
  contratos de shared se sellan primero para paralelizar API/Web.

## Migration Plan

`pnpm db:migrate` crea `SavedReport` (tabla nueva, aditiva). Rollback:
`DROP TABLE` + revert — ningún dato existente se toca. Deploy normal
dev → main por release gate; los endpoints nuevos son aditivos y los
viejos quedan como adaptadores.
