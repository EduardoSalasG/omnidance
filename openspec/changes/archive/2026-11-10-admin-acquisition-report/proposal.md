# Proposal: admin-acquisition-report

## Why

La fuente de adquisición orgánica ya se persiste en el alta
(`Person.acquisitionSource`/`acquisitionDetail`, spec
auth/acquisition-source) y los canales con referrer viven en
`Referral.source` (INVITE/GIFT_TICKET/LINK), pero no existe ninguna
consulta que la exponga: el dato es hoy write-only. El CAC por canal
es métrica SaaS del día 1 (omni-dance.md) y el owner necesita ver qué
canal trae altas antes de invertir en campañas.

## What Changes

- Nueva entidad `acquisition` en el lente ADMIN de la consola de
  consultas (`/analitica`): una fila por canal de adquisición con el
  conteo de altas del período y su porcentaje del total.
- Canal de una alta: `Referral.source` cuando la persona fue referida
  (invite/gift_ticket/link); si no, `Person.acquisitionSource`
  (`utm:<s>`/`ref:<host>`/`landing:<path>`/`direct`); si tampoco,
  `sin_dato` (cuentas antiguas o sin capture).
- Filtros: rango de fechas (`from`/`to` sobre `Person.createdAt`) y
  `kind` multi por prefijo de canal (utm/ref/landing/direct/invite/
  gift_ticket/link/none).
- Hereda gratis: preview paginado, export CSV/PDF, consultas guardadas
  (misma máquina del query engine; sin endpoints ni páginas nuevas).
- No es CAC monetario todavía: reporta altas por canal. El costo
  llega cuando exista spend por campaña.

## Capabilities

### New Capabilities

(ninguna)

### Modified Capabilities

- `analytics/query-console`: el catálogo del lente ADMIN gana la
  entidad `acquisition` (altas por canal de adquisición).

## Impact

- `packages/shared/src/query-catalog.ts`: entrada de entidad +
  enum de kinds.
- `apps/api/src/query/entities/admin.ts`: handler `acquisition` en
  `ADMIN_ENTITIES`; `ENTITY_TITLES`.
- i18n `query.entities.acquisition`, `query.filters.kind`,
  `query.optionLabels.<kinds>`, `query.cols.*` en los 4 catálogos.
- Tests: `query.service.spec.ts` (o spec del registry admin).
- `docs/qa-flows-inventory.md`: entidad nueva disponible en lente
  ADMIN de /analitica.
- Sin migración, sin endpoints nuevos, sin cambios de página: el
  front renderiza la entidad data-driven desde el catálogo.
