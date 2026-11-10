# Tasks: admin-acquisition-report

## 1. Catálogo y handler

- [x] 1.1 `packages/shared/src/query-catalog.ts`: entidad `acquisition`
  en `QUERY_CATALOG.ADMIN` - filtros `from`,`to`,`kind` (enum multi:
  utm,ref,landing,direct,invite,gift_ticket,link,none); columnas
  `canal`,`altas`,`pct`. Rebuild de shared (`pnpm --filter
  @omnidance/shared build`).
- [x] 1.2 `apps/api/src/query/entities/admin.ts`: handler `acquisition`
  en `ADMIN_ENTITIES` - resolución de canal (referral más antigua >
  acquisitionSource > sin_dato), agregado por canal, pct entero,
  orden altas desc + canal; `total` = canales, `summary` con altas del
  período. `ENTITY_TITLES.ADMIN.acquisition` = "Altas por canal".
- [x] 1.3 i18n en los 4 catálogos: `query.entities.acquisition`,
  `query.filters.kind`, `query.optionLabels` para los kinds y
  `query.cols.acquisition.*`.

## 2. Tests

- [x] 2.1 Spec del registry admin (o `query.service.spec.ts`): canal
  por referral gana a null, agrupación utm:*/ref:*/landing:* bajo su
  fila propia, `sin_dato`, orden por altas, `kind` filtra por prefijo,
  `kind` inválido → 400, total = canales.

## 3. Cierre

- [x] 3.1 `docs/qa-flows-inventory.md`: entidad `acquisition` en la
  sección /analitica (lente ADMIN).
- [x] 3.2 Verificación: `pnpm --filter @omnidance/api test` (specs del
  query engine), `tsc --noEmit` en api y shared, eslint de los archivos
  tocados, i18n-audit, `openspec validate --changes`.
