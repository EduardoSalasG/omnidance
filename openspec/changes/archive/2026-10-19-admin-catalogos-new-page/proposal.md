# Proposal; admin-catalogos-new-page

## Why

`/admin/catalogos` tiene cards `flex-wrap` que en móvil quedan ilegibles
(nombre, badge y dos botones repartidos sin estructura de fila) y el
alta vive como form inline al pie de cada sección; el anti-patrón que
`console-patterns` prohíbe (crear = CTA → página dedicada).

## What Changes

- **Listado → filas de lectura**: cada sección pasa de cards sueltas a
  `Card p-0 divide-y` con filas `min-h-11`: nombre truncable a la
  izquierda, meta (badge género / orden) + acciones en la zona derecha.
  Edición sigue inline pero como form apilado en la fila.
- **Crear → página dedicada**: cada sección gana CTA "＋ Nuevo" que va a
  `/admin/catalogos/nuevo?cat=styles|levels|types`; página con
  `ConsoleHeader` de vuelta, campo extra según catálogo (género/orden/
  ninguno), POST y regreso al listado. `cat` inválido → la primera
  sección.
- Se elimina el form de alta inline de cada sección.

## Capabilities

- **Modified Capabilities**: `admin`; mantenedor de catálogos.

## Impact

- `apps/web/.../admin/catalogos/page.tsx`; reescritura de
  `CatalogSection` (filas + CTA, sin alta inline).
- Nueva `apps/web/.../admin/catalogos/nuevo/page.tsx`.
- i18n: `adminCatalogs.new`, `newTitle` en `messages/es-CL.json`.
- `docs/qa-flows-inventory.md`; flujo catálogos.
