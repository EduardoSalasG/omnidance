# Proposal — admin-usuarios-refine

## Why

Dos problemas de densidad en `/admin/usuarios`: (1) en la ficha
`[personId]`, las listas de actividad por rol renderizan TODAS sus filas
— un productor con 60 eventos pasados produce una ficha interminable,
cuando el patrón de las fichas admin ya es "expand tras 5"; (2) en el
listado, el card solo muestra nombre/email/roles — el admin no puede
ver de un vistazo el peso real del actor (¿cuántas academias administra
este owner? ¿cuántos eventos ha creado este productor?).

## What Changes

- **`DataList` con expand tras 5** en `/admin/usuarios/[personId]`:
  cada lista de actividad por rol muestra sus primeras 5 filas y un
  toggle "Ver las {count}"/"Ver menos" — mismo patrón visual que
  `/admin/academias/[id]` (botón secondary sm centrado).
- **`GET /admin/users` enriquecido**: cada item suma `academiesCount`
  (Academy.ownerId = person) y `eventsCount` (Event.producerId =
  person), resueltos por `groupBy` sobre los ids de la página — 2
  queries extra por página, sin N+1.
- **Card del listado con contadores**: línea meta con "N academia(s)" /
  "N evento(s)" solo cuando el count > 0 — cero no ensucia el card de
  bailarines sin producción.

## Capabilities

- **Modified Capabilities**: `admin` — ficha y listado de usuarios.

## Impact

- `apps/web/.../admin/usuarios/[personId]/page.tsx` — `DataList` gana
  expand autocontenido; keys `admin.users.roleData.showAll/showLess`.
- `apps/api/.../admin.controller.ts` — `users()` suma los dos counts.
- `apps/web/.../admin/usuarios/page.tsx` — tipo `SearchUser` + línea de
  contadores; keys `admin.users.academiesCount/eventsCount`.
- `docs/qa-flows-inventory.md` — flujo admin/usuarios actualizado.
- `docs/openapi.json` + postman — regenerados (cambió la respuesta).
