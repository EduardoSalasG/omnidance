# Tasks — backlog-wave

## W1 — Producer event CRUD (agente events) ✓

- [x] `POST /events` (events.manage) → DRAFT con venue/series/blocks/DJs en tx
- [x] `PATCH /events/:id` (owner o admin) — solo DRAFT/PUBLISHED; blocks/djs reemplazan
- [x] `POST /events/:id/publish` DRAFT→PUBLISHED + `POST /events/:id/cancel`→CANCELLED
- [x] `POST /events/:id/staff` upsert StaffAssignment + `GET /events/:id/staff`
- [x] e2e `test/gap-producer.e2e.spec.ts` — 31/31

## W2 — Entry passes + trip matching (agente social) ✓

- [x] `POST /guest-lists/:id/entries/:entryId/pass` → EntryPass LIST idempotente (owner/producer/social.manage)
- [x] `GET /events/:id/passes` — producer/staff/social.manage, join person
- [x] `GET /trips/matches?destination|eventId` — otros viajeros, solape de fechas, límite 50
- [x] e2e `test/gap-passes-trips.e2e.spec.ts` — 18/18

## W3 — Series-pass + payouts (agente payments) ✓

- [x] `POST /checkout/series-pass` {seriesId, month} → Payment SERIES_PASS (`sp_<series>_<mes>_<uuid>`)
- [x] Webhook PAID → upsert SeriesPass + notify (idempotente, refId decode = fuente primaria)
- [x] Check-in resuelve SeriesPass (ticket→entryPass→seriesPass; passType SERIES_PASS, no se marca USED)
- [x] `POST /admin/payouts/generate` + list + approve + pay (AuditLog, idempotente por actor+período)
- [x] `GET /me/payouts` (crm.manage)
- [x] e2e `test/gap-payments.e2e.spec.ts` — 22/22

## W4 — Academia avanzada (agente academies) ✓

- [x] private-lessons: request/list/patch(confirm|cancel|done|reschedule)/mine — instructorId guarda personId
- [x] videos: create (owner) + list gated por Attendance a la Class o Enrollment ACTIVE + delete
- [x] e2e `test/gap-academies2.e2e.spec.ts` — 30/30

## W5 — CRM (agente crm — módulo nuevo) ✓

- [x] `GET /crm/people` (union scores+tags) + `POST /crm/scores/recompute`
- [x] score=min(100, att*10+spend/1000+ref*15); segment NEW→AT_RISK→BRINGS_PEOPLE→CORE
- [x] tags create(dedup)/delete; campaigns DRAFT→send (NOTIFY | DISCOUNT_CODE → DiscountCode CAMPAIGN)
- [x] triggers CRUD + `POST /crm/triggers/evaluate` (WINBACK + reglas v1 resto, cooldown 7d)
- [x] `CrmTriggersScheduler` node-cron 09:00 (skip NODE_ENV=test)
- [x] Referral GIFT_TICKET en tickets transfer (best-effort, anti-duplicado)
- [x] e2e `test/gap-crm.e2e.spec.ts` — 24/24

## W6 — Realtime + push (agente notifications) ✓

- [x] `NotificationsGateway` — cookie de sesión en handshake → room `person:{id}`; CORS = allowlist de main.ts
- [x] `WebPushSender` — VAPID env; no-op sin keys; 404/410 limpia token muerto
- [x] notify → fan-out WS (`notification`) + push vía ports opcionales REALTIME_PORT/PUSH_PORT (best-effort)
- [x] `realtime.spec.ts` — 16 unit

## Integración (padre) ✓

- [x] `crm.module.ts` + registro en `app.module.ts`; controllers registrados en social/payments/academies/notifications
- [x] Reseed aplicado: perms `events.manage`/`crm.manage` + grants + params `series_pass.*`, `service_fee.series_pass_clp`, `crm.winback_days`
- [x] Suite completa **776/776 (34 archivos)** + typecheck limpio + API en vivo con todas las rutas mapeadas (121 paths)
- [x] `docs/openapi.json` + Postman regenerados (121 requests) + `docs/flows.md` +5 diagramas
- [x] Commit por scope

### Pendientes conocidos

- BullMQ/Redis diferido — triggers corren en `node-cron` in-process; Redis disponible en docker-compose si escala.
- Web Push requiere `WEB_PUSH_VAPID_PUBLIC_KEY/PRIVATE_KEY/SUBJECT` en env — sin keys es no-op seguro.
- Payouts ACADEMY/VENUE devuelven gross=0 en v1 (falta vínculo Payment↔academy/venue en schema).
- `evaluateAllActiveTriggers` solo accesible vía scheduler (no hay endpoint admin para evaluación global manual).
- Frontend de las features nuevas (consola productor, CRM UI, videos academia) — siguiente ola web.
