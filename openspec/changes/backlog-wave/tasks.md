# Tasks — backlog-wave

## W1 — Producer event CRUD (agente events)

- [ ] `POST /events` (events.manage) → DRAFT con venue/series/blocks/DJs
- [ ] `PATCH /events/:id` (owner o admin) — solo DRAFT/PUBLISHED
- [ ] `POST /events/:id/publish` DRAFT→PUBLISHED + `POST /events/:id/cancel`→CANCELLED
- [ ] `POST /events/:id/staff` upsert StaffAssignment + `GET /events/:id/staff`
- [ ] e2e `test/gap-producer.e2e.spec.ts`

## W2 — Entry passes + trip matching (agente social)

- [ ] `POST /guest-lists/:id/entries/:entryId/pass` → EntryPass LIST idempotente
- [ ] `GET /events/:id/passes` — producer/staff, join person
- [ ] `GET /trips/matches?destination|eventId` — otros viajeros, solape de fechas
- [ ] e2e `test/gap-passes-trips.e2e.spec.ts`

## W3 — Series-pass + payouts (agente payments)

- [ ] `POST /checkout/series-pass` {seriesId, month} → Payment SERIES_PASS
- [ ] Webhook PAID → upsert SeriesPass + notify
- [ ] Check-in resuelve SeriesPass (event.seriesId + mes vigente)
- [ ] `POST /admin/payouts/generate` + list + approve + pay (AuditLog)
- [ ] `GET /me/payouts` (crm.manage)
- [ ] e2e `test/gap-payments.e2e.spec.ts`

## W4 — Academia avanzada (agente academies)

- [ ] private-lessons: request/list/patch(confirm|cancel|done)/mine
- [ ] videos: create (owner) + list gated por asistencia + delete
- [ ] e2e `test/gap-academies2.e2e.spec.ts`

## W5 — CRM (agente crm — módulo nuevo, archivos en src/crm/)

- [ ] `GET /crm/people` + scores recompute + segmentos
- [ ] tags create/delete
- [ ] campaigns create/send (NOTIFY | DISCOUNT_CODE)
- [ ] triggers list/toggle + `POST /crm/triggers/evaluate` (WINBACK)
- [ ] scheduler node-cron (provider fino sobre CrmService)
- [ ] Referral GIFT_TICKET en tickets transfer
- [ ] e2e `test/gap-crm.e2e.spec.ts`

## W6 — Realtime + push (agente notifications)

- [ ] `NotificationsGateway` — auth por cookie de sesión, room `person:{id}`
- [ ] `WebPushSender` — VAPID env; no-op seguro sin keys
- [ ] notify/notifySafe → emit WS + push best-effort vía ports del dominio
- [ ] unit specs (gateway auth + sender no-op)

## Integración (padre)

- [ ] `crm.module.ts` + registro en `app.module.ts` + controllers en módulos
- [ ] Reseed (permisos/params ya en seed-common)
- [ ] Suite completa + typecheck + smoke
- [ ] Regenerar openapi.json + Postman + `docs/flows.md`
- [ ] Commit por scope
