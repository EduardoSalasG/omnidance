# Tasks; admin-catalogos-new-page

## 1. Listado

- [x] `CatalogSection`: filas en `Card p-0 divide-y` (nombre | meta +
      Editar/Eliminar a la derecha); edición inline → form apilado en
      fila; eliminar form de alta; CTA "＋ Nuevo" → `/nuevo?cat=X`.

## 2. Página /admin/catalogos/nuevo

- [x] `nuevo/page.tsx`: `use(searchParams)` → cat ∈
      styles/levels/types (default styles); `ConsoleHeader` back;
      form nombre + campo extra según cat; POST endpoint; éxito →
      `router.push("/admin/catalogos")`.

## 3. i18n + docs

- [x] `adminCatalogs.new`, `newTitle` en `messages/es-CL.json`.
- [x] `docs/qa-flows-inventory.md`; flujo catálogos.
- [x] typecheck web, eslint, i18n-audit.
