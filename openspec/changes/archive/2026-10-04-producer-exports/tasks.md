# Tasks — producer-exports

## 1. API (TDD)

- [x] 1.1 Tests rojos en `events.controller.spec.ts`: auth (owner 200,
  otro productor 403, admin 200, sin sesión 401 implícito por guard),
  evento inexistente 404, dataset inválido 400; contenido de `sales`
  (headers, join de nombres, canal desde Payment, ticket sin payment),
  `checkins` (anulado=si, nota), `guestlist` (label/owner/invitado),
  escaping CSV y BOM.
- [x] 1.2 `EventsController`: `GET :id/export.csv` + helpers CSV
  (`csvCell`, `toCsv`) + join a Person/Payment.

## 2. UI

- [x] 2.1 `ExportSection` en `components/producer/` + montaje en
  `/productor/eventos/[id]` bajo `canManage`.
- [x] 2.2 i18n `parts/producer.json` (export, sales, checkins, guestlist).

## 3. Cierre

- [x] 3.1 Specs verdes + `tsc --noEmit` api/web + build.
- [x] 3.2 `docs/openapi.json` + postman regenerados (API viva); docs si
  corresponde; `openspec validate --strict`.
