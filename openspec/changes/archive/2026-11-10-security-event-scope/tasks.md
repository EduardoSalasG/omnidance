# Tasks: security-event-scope

## 1. Helper de scoping

- [x] 1.1 `requireEventActor(eventId, personId)` compartido: pasa con
  superuser/`admin.access`, `event.producerId === actor` o
  `isStaffAssigned(eventId, actor)`; 403 genérico si no. Reutilizar la
  fuente de `isStaffAssigned` de `checkins.service.ts` / `voidCheckin`.

## 2. Checkins

- [x] 2.1 `register()`/`syncCheckin()`/manual: scoping por `eventId` en
  `checkins.service.ts` (`POST /checkins`, `/sync`, `/manual`).
- [x] 2.2 `listByEvent`/`doorManifest`: scoping por `eventId`.
- [x] 2.3 `closeCheckin` (`POST /checkins/:id/out`): scoping por el
  `eventId` del check-in.

## 3. Guest lists y passes

- [x] 3.1 `guest-lists.controller.ts` create/list/entries/`pass`:
  scoping por el evento dueño de la lista (resolver `list.eventId` para
  los endpoints por `:listId`/`:id`).
- [x] 3.2 `entry-passes.controller.ts` `GET /events/:id/passes`: scoping.

## 4. Discount codes

- [x] 4.1 `discounts.service.ts` create: validar ownership del
  `eventId`/`seriesId` scoped (admin salta).
- [x] 4.2 list/detail/redemptions: filtro `createdById === actor` salvo
  admin.

## 5. Tests

- [x] 5.1 Specs por módulo: actor no vinculado → 403 en cada endpoint;
  staff asignado/productor/admin → OK; discounts: create scoped ajeno →
  403, list sin ajenos, admin ve todos. Actualizar fixtures existentes
  que ya no pasen (asignar staff antes).

## 6. Cierre

- [x] 6.1 `docs/qa-flows-inventory.md`: secciones de checkins/guest
  lists/passes/discounts notan el requisito de vinculación.
- [x] 6.2 `pnpm --filter @omnidance/api test` verde + `npx tsc --noEmit`.
