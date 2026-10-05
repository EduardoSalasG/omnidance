# backlog-closure — cierre de pendientes

Cierra los pendientes conocidos de backlog-wave y web-wave-2.

## Alcance

1. **Payouts ACADEMY/VENUE** — computeSettlement usa el vínculo transitivo
   Payment.eventId → Event.academyId/venueId (sin cambio de link: los eventos
   producidos directamente por la entidad — producerId null — devengan a ella).
   me/payouts incluye academias del owner.
2. **Fee por evento** — `Event.serviceFeeClp Int?` override admin del
   service_fee.presale_clp global; checkout + webhook lo honran.
3. **Eval manual de triggers CRM** — POST /crm/triggers/evaluate-all (crm.manage).
4. **BottomNav** — tab /notificaciones con badge de no-leídas (CustomEvent).
5. **PWA icons** — PNGs 192/512 en manifest.
6. **Auditoría a11y/UX estática** — reporte + fixes críticos.

## Fuera de scope

- BullMQ/Redis (diferido documentado — node-cron in-process).
- Venue payouts en me/payouts (Venue no tiene ownerId en schema).
