# Change: admin-jobs-mail-campaigns

## Por qué

Los trabajos programados hoy son invisibles e incontrolables para el
admin: 4 crons `node-cron` con hora hardcodeada en código
(`AcademiesScheduler` 09:00 - el único que envía mail, recordatorios de
renovación; `SubscriptionsScheduler` 09:00; `CrmTriggersScheduler`
09:00; `TicketsScheduler` 13:00 UTC). No hay forma de ver qué está
agendado, cuándo corrió por última vez, si falló, ni de pausar/reprogramar
sin deploy. Tampoco existe ningún mecanismo para programar envíos de
mail nuevos (avisos, campañas) sin tocar código.

Decisión de producto (conversada): el admin necesita **ambos**
alcances - (A) consola de control de todos los jobs existentes con
historial, y (B) campañas de mail programadas (únicas y recurrentes)
compuestas por el admin sin deploy.

## Qué cambia

### A. Consola de jobs (`/admin/jobs`)

- Nuevo modelo `ScheduledJob` (DB) + `JobRun` (historial de corridas):
  cada job registrado tiene key única, label, descripción, `cronExpr`
  editable, `timezone` (default America/Santiago), `enabled`,
  `lastRunAt/lastStatus/lastError`, `nextRunAt`, `runCount`.
- `JobsRunner` central: tick `node-cron` cada minuto que ejecuta los
  jobs enabled cuyo `nextRunAt` ya venció (calculado con `cron-parser`,
  respeta timezone y DST). Cada corrida persiste un `JobRun`
  (RUNNING→OK/ERROR, trigger CRON|MANUAL, duración, meta con contadores).
  Catch-up: un job vencido mientras el proceso estaba caído corre una
  vez al levantar (no salta corridas).
- Registro declarativo en código (`JOB_REGISTRY`): los 4 schedulers
  existentes se refactorizan para registrar `{key, label, defaultCron,
  handler}` en vez de llamar `schedule()` directo. En bootstrap el
  runner hace upsert por key - **nunca pisa `cronExpr`/`enabled`
  editados por el admin** (la DB gana sobre el default).
- Endpoints admin (`admin.access`): `GET /admin/jobs`,
  `PATCH /admin/jobs/:key` (cronExpr/timezone/enabled, valida cron con
  400), `POST /admin/jobs/:key/run` (corrida manual async, 409 si ya
  corre), `GET /admin/jobs/:key/runs` (historial). Todas auditan en
  `AuditLog`.
- UI `/admin/jobs`: lista con estado, horario, próxima corrida, último
  resultado; editar horario (input cron + presets), pausar/reactivar,
  correr ahora, historial expandible con errores y contadores.

### B. Campañas de mail programadas (`/admin/campanas`)

- `MailCampaign`: nombre, `subject`, `htmlBody` (HTML libre del admin),
  `audience` (JSON: `ALL` | `ROLE`+roleKey | `EVENT`+eventId → dueños
  de tickets ACTIVE), `scheduleKind` ONCE (`runAt`) | CRON (`cronExpr`),
  `timezone`, status DRAFT→SCHEDULED→SENDING→DONE|FAILED|CANCELLED.
- `MailCampaignRun` + `MailCampaignRecipient` (dedup por run+person,
  status PENDING|SENT|FAILED|SKIPPED): cada corrida re-ancla la
  audiencia, crea los recipients y envía secuencial con ~150ms de
  pausa (≈6 req/s, dentro del rate de Resend). Cancelar mid-send marca
  los PENDING restantes como SKIPPED entre lotes.
- Dispatch: un `ScheduledJob` de sistema `mail.campaign_dispatch`
  (`* * * * *`) cuyo handler toma las campañas `SCHEDULED` con
  `nextRunAt` vencido - aparece en la consola y se puede pausar como
  cualquier job.
- Endpoints admin: CRUD de campañas (edición solo DRAFT/SCHEDULED),
  `POST /:id/test` (envía copia al email del admin), `POST /:id/run`
  (corrida inmediata), `POST /:id/cancel`, `GET /:id/runs`,
  `GET /admin/mail-campaigns/audience-count` (preview del tamaño de
  audiencia). Todas auditan.
- UI `/admin/campanas`: lista con status/contadores, formulario de
  creación/edición (asunto, textarea HTML, **preview en iframe
  sandboxed**, selector de audiencia con conteo en vivo, fecha-hora o
  cron), envío de prueba, programar/pausar, runs con sent/fail.

## Fuera de scope

- Apple Wallet, DTE/SII (de handoffs previos).
- Unsubscribe/opt-out legal y listas de supresión (marcar como gap
  conocido: las campañas van a usuarios registrados de la plataforma -
  la casilla `no-reply` ya envía mails transaccionales hoy).
- Segmentación por tags CRM o scores (las audiencias v1 son
  ALL/ROLE/EVENT).
- Jobs arbitrarios ejecutando código - los jobs registrables solo los
  define el código; el admin controla horario/activación, nunca el
  handler.
