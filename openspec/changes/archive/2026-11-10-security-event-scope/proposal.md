# Proposal: security-event-scope

## Why

La auditoría de seguridad 2026-11-10 (docs/security-audit-2026-11-10-backend.md)
encontró una familia BOLA cross-tenant: varios endpoints exigen un permiso
global (`checkins.write`, `social.manage`, `discounts.manage`) pero el
servicio no verifica que el actor pertenezca al evento. Resultado: staff o
productor de un evento puede registrar check-ins, leer manifiestos con PII,
emitir passes gratis y crear/listar códigos de descuento en eventos de
otros productores. La asimetría lo delata: `voidCheckin`, `doorSale` y
`requireOwnerOrAdmin` ya scopean correctamente.

## What Changes

- Helper de scoping `requireEventActor(eventId, personId)`: pasa si el
  actor es superuser/admin, productor dueño del evento, o staff asignado
  (`isStaffAssigned`). Reutiliza la lógica existente de `voidCheckin`/
  `doorSale`/`requireOwnerOrAdmin` — no inventar una fuente distinta.
- Checkins: `register` (incl. `sync` y `manual`), `listByEvent`,
  `doorManifest` y `closeCheckin` (`/:id/out`) exigen el scoping además del
  permiso global.
- Guest lists: create/list/entries/`pass` exigen scoping (el permiso
  `social.manage` global ya no basta).
- Entry passes: `GET /events/:id/passes` exige scoping (deja de exponer
  teléfonos a staff ajeno).
- Discount codes: `create` valida ownership del evento/serie scoped;
  `list`, `detail` y `redemptions` se filtran por ownership salvo admin.

## Capabilities

`event-access-scope` (nueva, cross-cutting sobre checkins/social/events/
checkout-discounts).

## Out of scope

- Otras superficies con la misma lente (crm, gamification, classes,
  trip, mail-campaigns, academy-*): pendiente de una pasada dirigida
  separada (documentado en el reporte).
