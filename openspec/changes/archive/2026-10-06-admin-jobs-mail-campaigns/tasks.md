# Tasks - admin-jobs-mail-campaigns

- [x] `pnpm --filter @omnidance/api add cron-parser` (+ @types si aplica).
- [x] Schema: `ScheduledJob`, `JobRun`, `MailCampaign`,
  `MailCampaignRun`, `MailCampaignRecipient` (+ relación
  `Person.mailCampaigns`). Migración + client regen.
- [x] `src/jobs/`: `JOB_REGISTRY` (token+tipo), `JobsService`
  (register/sync upsert sin pisar ediciones, list, update valida cron
  con cron-parser → 400, runNow 409-si-RUNNING, listRuns,
  markOrphans), `JobsRunner` (tick `* * * * *`, skip NODE_ENV=test,
  catch-up, JobRun lifecycle, audit helpers). `JobsModule` @Global.
  Specs.
- [x] Refactor schedulers → `registry.register()`: AcademiesScheduler,
  SubscriptionsScheduler, CrmTriggersScheduler, TicketsScheduler.
- [x] `src/mail/`: `MailCampaignsService` (CRUD, audiencias
  ALL/ROLE/EVENT + resolveAudience + audienceCount, dispatchDue,
  sendRun secuencial con cancel-check, testSend, cancel, runNow) +
  registro del job `mail.campaign_dispatch`. Specs.
- [x] `AdminJobsController` + `MailCampaignsController`
  (`admin.access`, AuditLog en cada mutación). Specs.
- [x] e2e wiring: JobsModule/MailModule en specs e2e si listan
  providers manualmente.
- [x] Front: `/admin/jobs` (lista, editar cron+presets, toggle, run
  now, historial), `/admin/campanas` (lista, form, preview iframe
  sandbox, audiencia+count, once/cron, test, cancel, runs), cards en
  hub `/admin`. i18n part `adminJobs`.
- [x] Docs: architecture.md (jobs runner + campañas), omni-dance.md,
  openapi+postman regen, `.env.example` si aplica.
- [x] Verificación: specs nuevos, suite completa, tsc api+web,
  next build, i18n audit, openspec validate. Commit + push dev +
  handoff.
