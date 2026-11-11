# Design: security-event-scope

## Enfoque

Un solo punto de verificación reutilizable. Ya existen tres patrones de
scoping en el código: `isStaffAssigned(eventId, personId)` en
`checkins.service.ts` (usado por `voidCheckin`/`doorSale`),
`requireOwnerOrAdmin` en `events.controller.ts` y `AcademyAccess` en
academies. Se introduce `requireEventActor(eventId, personId)` en un
helper compartido (ubicación sugerida: `apps/api/src/events/` o un
servicio de dominio de eventos) con la semántica:
`superuser || admin.access || event.producerId === actor || isStaffAssigned`.

No cambia el guard ni el permiso requerido por endpoint: el scoping se
agrega DENTRO del servicio/controller, como ya hace `voidCheckin`.

## Decisiones

- **403 vs 404**: 403 con mensaje genérico, consistente con
  `voidCheckin`/`doorSale` (que responden 403 "no eres staff del evento"
  o equivalente). No ocultar existencia: los eventos son públicos.
- **Discount codes**: create con `eventId`/`seriesId` exige ownership del
  recurso; sin scope se mantiene `discounts.manage` (códigos globales del
  actor). Listado/detalle/redemptions filtran `createdById === actor`
  salvo `admin.access`.
- **Staff asignado = `isStaffAssigned`**: misma fuente que door-sale;
  si cubre productor-staff del evento, reutilizarla tal cual.
- **Series scope en discounts**: la serie pertenece a un producer via
  `eventSeries.producerId` (verificar campo real).

## Riesgos

- Tests existentes que usaban actores no-asignados: actualizar fixtures
  para asignar staff/producto antes de operar.
- Endpoints llamados internamente (jobs, webhooks): el scoping solo
  aplica a paths de actor HTTP, no a llamadas internas de servicio.
