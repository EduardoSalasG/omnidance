# Proposal; admin-users-pagination

## Why

`/admin/usuarios` tiene tres problemas prácticos: (1) `GET /admin/users`
responde un array plano capado a `take: 100`; con ~1000 personas en la
base, un filtro de rol ancho (ej. DANCER) devuelve 100 filas de una sola
y sin indicación de que hay más; (2) al entrar, seleccionar un rol
descarga todos los resultados de golpe en vez de paginarlos; (3) el
contrato array-sin-total impide mostrar "N resultados" ni navegar
páginas, lo que el patrón de consolas ya resolvió con
`{items,total,page,pageSize}` + `Pager`.

## What Changes

- **`GET /admin/users` paginado**: acepta `page`/`pageSize` (misma
  normalización `pageParams` que el resto de consolas; page≥1 default
  1, size default 25 cap 100) y responde el envelope
  `{items,total,page,pageSize}` en vez del array plano. La guarda
  "sin q≥2 ni rol → vacío" se mantiene, ahora como envelope vacío.
- **`/admin/usuarios` con `Pager`**: el listado consume el envelope,
  muestra total de resultados y navega páginas; cambiar `q` o `role`
  resetea a página 1. El select de rol sigue resolviéndose del catálogo
  RBAC vivo (`GET /admin/roles`), y seleccionar un rol lista paginado
  sin exigir texto.
- **`/analitica/usuarios` adaptado al envelope**: mismo endpoint, lee
  `items` (buscador por nombre solamente; no gana UI de paginación).

## Capabilities

- **Modified Capabilities**: `admin`; el buscador de personas pasa a
  contrato paginado.

## Impact

- `apps/api/src/admin/infrastructure/admin.controller.ts`;
  `UsersQueryDto` gana `page`/`pageSize`; `users()` usa `pageParams` +
  `count` y devuelve envelope.
- `apps/web/src/app/[locale]/(app)/admin/usuarios/page.tsx`; envelope +
  `Pager` + reset de página al cambiar filtros.
- `apps/web/src/app/[locale]/(app)/analitica/usuarios/page.tsx`; lee
  `items` del envelope.
- `docs/qa-flows-inventory.md`; flujo admin/usuarios actualizado.
- `docs/openapi.json` + `docs/postman/*`; regenerados (cambió la
  respuesta de un endpoint).
- Sin cambios de schema ni i18n nueva (`common.pager` ya existe).
