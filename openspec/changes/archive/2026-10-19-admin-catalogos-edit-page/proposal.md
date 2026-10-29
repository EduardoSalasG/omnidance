# Proposal; admin-catalogos-edit-page

## Why

La edición de valores de catálogo seguía inline en las filas del
listado; el patrón de consolas exige edición en página dedicada.

## What Changes

- "Editar" en cada fila de `/admin/catalogos` navega a
  `/admin/catalogos/[cat]/[id]/editar` (ConsoleHeader de vuelta, form
  prefllenado, PATCH y regreso al listado).
- Se elimina el form de edición inline del listado; las filas quedan
  de solo lectura.

## Capabilities

- **Modified Capabilities**: `admin`; mantenedor de catálogos.

## Impact

- `admin/catalogos/page.tsx`; sin edición inline; Editar → link.
- Nueva `admin/catalogos/[cat]/[id]/editar/page.tsx`.
- i18n: `adminCatalogs.editTitle`, `valueNotFound`.
- `docs/qa-flows-inventory.md`.
