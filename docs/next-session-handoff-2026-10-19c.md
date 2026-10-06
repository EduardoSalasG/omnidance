# Handoff - 2026-10-19c (admin-jobs-mail-campaigns)

## Completado en esta sesión (commit en dev)

### `admin-jobs-mail-campaigns` → consola de jobs + campañas de mail

Decisión de producto (conversada): ambos alcances - control de los
crons existentes Y campañas de mail programables por el admin
(audiencias ALL/ROLE/EVENT, única + recurrente, HTML libre + preview).

**Consola de jobs** (`ScheduledJob`/`JobRun`):
- `JOB_REGISTRY` global (`JobsModule` @Global, patrón STORAGE): los 4
  schedulers registran `{key, label, defaultCron, handler}` en
  `onModuleInit` - ya no llaman `node-cron.schedule()`.
- `JobsService.sync()` en bootstrap: upsert por key SIN pisar
  `cronExpr`/`enabled`/`timezone` editados por el admin; key sin
  handler → `orphaned`; runs RUNNING stale → ERROR + libera mutex.
- `JobsRunner`: UN tick `* * * * *` corre jobs `enabled && !orphaned
  && nextRunAt <= now` (catch-up tras downtime). `nextRunAt` con
  **cron-parser** (dep nueva aprobada; DST de America/Santiago).
- Cada corrida → `JobRun` (RUNNING→OK|ERROR, trigger CRON|MANUAL,
  actorId, meta con contadores del handler). `runningRunId` = mutex
  (run manual concurrente → 409).
- `tickets.day_of` cambió de "13:00 hora servidor" a `0 9 * * *`
  America/Santiago explícito (los demás eran hora local del servidor
  → ahora CL explícito también).
- Endpoints `admin.access` + AuditLog: `GET/PATCH /admin/jobs/:key`,
  `POST :key/run`, `GET :key/runs`. Front `/admin/jobs`.

**Campañas de mail** (`MailCampaign`/`MailCampaignRun`/
`MailCampaignRecipient`):
- Audiencia = especificación re-anclada por corrida: `ALL` (con email)
  | `ROLE`+roleKey APPROVED | `EVENT`+eventId (owners tickets ACTIVE).
- `scheduleKind` ONCE (runAt) | CRON (cronExpr+tz). Estados
  DRAFT→SCHEDULED→SENDING→DONE|FAILED|CANCELLED.
- `mail.campaign_dispatch` es un ScheduledJob (`* * * * *`) - pausable
  desde la consola detiene TODOS los envíos.
- `sendRun`: recipients dedup por run, envío secuencial ~150ms,
  SENT|FAILED|SKIPPED por destinatario; cancel mid-send corta y marca
  SKIPPED; crash recovery en bootstrap (run ERROR, campaña SENDING →
  SCHEDULED si CRON / FAILED si ONCE).
- `POST :id/test` = copia `[TEST]` al email del admin. Editar solo
  DRAFT/SCHEDULED (SENDING → 409).
- Front `/admin/campanas`: form con textarea HTML + preview iframe
  `sandbox`, audiencia con conteo vivo (`GET audience-count`),
  once/cron + presets, test/run/cancel. Cards en hub `/admin`.

## Verificación

- API vitest: **1709/1709, 86 archivos** (38 nuevos del slice)
- API tsc + web tsc limpios; `next build` 71/71 páginas; i18n
  `ALL_KEYS_OK`
- openapi/postman: **249 paths** (+11: jobs 4 + campaigns 7)
- openspec validate: válido
- En vivo: sync creó los 5 ScheduledJob con nextRunAt calculado;
  `/api/admin/jobs` y `/api/admin/mail-campaigns` → 401 sin sesión
- Dep nueva: `cron-parser@^5.10.1` (aprobada por usuario)

## Gaps conocidos

- Sin e2e de los nuevos endpoints (unit specs de service+controller
  cubren la lógica; falta spec e2e del wiring completo).
- Envío real nunca ejercido: test-send/Resend no probado con key real.
- Campañas sin opt-out/unsubscribe (declarado en proposal - las
  audiencias son usuarios registrados de la plataforma).
- Multi-instancia: el runner asume 1 proceso (prod actual). Si se
  escala hay que agregar claim atómico (`UPDATE ... WHERE runningRunId
  IS NULL`) - documentado en design.md.
- Selector de eventos del form trae solo PUBLISHED (browse take ~50).
- QA visual de ambas páginas en browser real pendiente.

## Próximos pasos posibles

- QA visual + e2e sandbox antes del release gate `dev → main`.
- Credenciales prod pendientes de otros slices: GOOGLE_WALLET_*,
  FINTOC_*, VAPID, RESEND.
