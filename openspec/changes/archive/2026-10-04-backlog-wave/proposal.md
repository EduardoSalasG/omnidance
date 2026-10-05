# Change: backlog-wave — features §16 del spec

## Why

El backlog de `omni-dance.md` §16 agrupa las capacidades de negocio que
faltan tras `spec-gap-closure`: CRUD de eventos del productor, pases de
lista, pase de serie, payouts, matching de viajes, academia avanzada
(clases privadas + videos), CRM transversal (scores/tags/campañas/
triggers/referrals) y tiempo real (WebSocket + Web Push + scheduler de
triggers). El schema de Prisma ya modela todas las entidades — el gap es
funcional: endpoints, servicios y wiring.

## What changes

| Slice | Scope | Endpoints/archivos |
|---|---|---|
| W1 producer-crud | events | `POST/PATCH /events`, `POST /events/:id/publish|cancel`, `POST/GET /events/:id/staff` |
| W2 passes+trips | social | `POST /guest-lists/:id/entries/:entryId/pass`, `GET /events/:id/passes`, `GET /trips/matches` |
| W3 payments | payments+checkins | `POST /checkout/series-pass`, webhook SERIES_PASS, `AdminPayoutsController` (generate/list/approve/pay), `GET /me/payouts`, resolución SeriesPass en check-in |
| W4 academia | academies | private-lessons CRUD + videos gated por asistencia |
| W5 CRM | crm (nuevo módulo) | people/scores/tags/campaigns/triggers + `POST /crm/triggers/evaluate` + scheduler node-cron + Referral en transfer |
| W6 realtime | notifications | `NotificationsGateway` (socket.io, auth por cookie) + `WebPushSender` (VAPID, no-op sin keys) + notify→emit+push |

## Constraints

- Sin cambios de schema (todas las entidades ya existen).
- `*.module.ts`, `app.module.ts`, `schema.prisma`, `package.json`,
  `seed-common.ts`: exclusivos del orquestador (padre).
- Permisos nuevos ya sembrados: `events.manage` (PRODUCER), `crm.manage`
  (PRODUCER + ACADEMY_OWNER). Params nuevos: `series_pass.price_clp`,
  `service_fee.series_pass_clp`, `crm.winback_days`.
- BullMQ diferido: en su lugar `node-cron` in-process para evaluación de
  triggers (decisión: un solo dev, infra gratis — Redis existe en
  docker-compose pero no es requisito para v1).
