# Fix: hooks de estado local hydration-safe

## Why

`useViewMode`, `useActiveRole`, `useSidebarState` leian localStorage durante render; el SSR no ve el storage -> HTML divergente -> React #418 (hydration) y, con data real del dashboard de academia, `formatDelta` llamaba `useNumFmt` dentro de un helper no-componente -> #310 fatal ("Application error") en /inicio lente academia.

## What changes

- Los tres hooks pasan a `useSyncExternalStore` con `getServerSnapshot` igual al default del SSR (patron ya usado en `theme.ts`).
- `formatDelta` recibe el formatter por parametro; `relativeTime` en /notificaciones igual (misma clase de bug del codemod i18n).
- /perfil: shell skeleton usa el hook en vez de leer storage directo.
