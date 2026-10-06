# Design: admin-jobs-mail-campaigns

## Decisiones de arquitectura

### 1. La DB es la fuente de verdad del horario; el código solo registra handlers

`JOB_REGISTRY` (token DI, Map key→`{label, description, defaultCron,
timezone, handler}`): cada bounded context registra sus jobs en
`onModuleInit`. `JobsService.onApplicationBootstrap` (corre después de
todos los moduleInit) hace upsert por key:

- job nuevo → `create` con `cronExpr = defaultCron`, `enabled = true`.
- job existente → solo actualiza `label`/`description`/`defaultCron` —
  **jamás pisa `cronExpr`/`enabled`/`timezone`**: la consola gana.
- job en DB cuyo key ya no está en el registry → se marca `orphaned`
  (badge en UI, no se ejecuta) — no se borra (preserva historial).

### 2. Un solo tick por minuto, no un node-cron por job

`JobsRunner` agenda UN `schedule("* * * * *", tick)` (skip en
`NODE_ENV=test`). El tick lee jobs `enabled && !orphaned && nextRunAt
<= now` y los ejecuta secuencialmente. Ventajas sobre re-registrar
tasks node-cron por job: una sola fuente de scheduling, `nextRunAt`
persistido (visible en UI), catch-up automático tras downtime (un job
vencido corre una vez al boot), y el tick es O(jobs) — trivial.

`nextRunAt` se calcula con **`cron-parser`** (`CronExpressionParser.
parse(expr, {tz})` → `.next()`). Dependencia nueva aprobada — valida
sintaxis completa y maneja DST de America/Santiago, cosa que un
matcher propio haría mal silenciosamente. `PATCH` con expr inválida →
400 con mensaje claro.

### 3. Concurrencia y corridas manuales

- `ScheduledJob.runningRunId` (o chequeo `JobRun.status = RUNNING`)
  → `POST /run` con una corrida activa responde 409.
- Instancia única de API en prod (un contenedor en la VM) → mutex en
  proceso + flag DB basta; no hace falta lock distribuido (si se
  escala a réplicas en el futuro, el tick ya es el único consumidor y
  habría que agregar un `UPDATE ... WHERE runningRunId IS NULL`
  atómico — se deja documentado).
- Corrida manual crea `JobRun{trigger: "MANUAL", actorId}` y corre el
  handler en background (sin await en el request) — el front hace
  polling del run.

### 4. Campañas: audiencia re-anclada por corrida, recipients por run

`MailCampaign.audience` es especificación, no snapshot: en cada run se
resuelven los personIds actuales (ALL = personas con email; ROLE =
PersonRole APPROVED con ese roleKey; EVENT = dueños de Ticket ACTIVE
del evento) y se crean `MailCampaignRecipient` del run
(`@@unique(runId, personId)`). Esto hace cada corrida resumible: si el
proceso cae mid-send, los `PENDING` del run se pueden reintentar sin
duplicar `SENT`.

Envío secuencial `await` por recipient con `sleep(150)` → ≈6 req/s.
Entre recipients se re-lee `campaign.status`: si pasó a CANCELLED,
cortar y marcar restantes SKIPPED. Contadores `sentCount/failCount` en
run y campaña.

`mail.campaign_dispatch` es un `ScheduledJob` registrado con cron
`* * * * *`: handler = tomar campañas `SCHEDULED && nextRunAt <= now`
y despacharlas una a una. Aparece en la consola → el admin puede
pausar el envío de TODAS las campañas sin tocar cada una.

### 5. Cron de campaña vs cron de job

Una campaña CRON no es un ScheduledJob: su recurrencia vive en
`campaign.cronExpr` y el dispatcher recalcula `nextRunAt` tras cada
run. Separación honesta: jobs = capacidades del sistema; campañas =
instancias de contenido creadas por el admin.

### 6. Seguridad y auditoría

- Todas las rutas bajo `SessionGuard + RolesGuard +
  @RequirePermissions("admin.access")` (convención de la consola).
- `htmlBody` se guarda crudo (admin confiable) y el preview usa
  `<iframe sandbox>` sin allow-same-origin — el HTML del admin no
  puede correr scripts en el contexto de la app.
- `AuditLog` en cada mutación: `JOB_UPDATE`, `JOB_RUN_MANUAL`,
  `MAIL_CAMPAIGN_CREATE/UPDATE/CANCEL/TEST/RUN` con prev/next.
- El mailer nunca loggea bodies; el `JobRun.meta` guarda solo
  contadores.

## Modelo de datos (migración `admin_jobs_mail_campaigns`)

```prisma
model ScheduledJob {
  id           String   @id @default(cuid())
  key          String   @unique  // academies.renewal_reminders | subscriptions.reconcile | crm.triggers | tickets.day_of | mail.campaign_dispatch
  label        String
  description  String?
  cronExpr     String
  defaultCron  String
  timezone     String   @default("America/Santiago")
  enabled      Boolean  @default(true)
  orphaned     Boolean  @default(false)
  runningRunId String?
  lastRunAt    DateTime?
  lastStatus   String?  // OK | ERROR | RUNNING
  lastError    String?
  nextRunAt    DateTime?
  runCount     Int      @default(0)
  runs         JobRun[]
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
}

model JobRun {
  id         String       @id @default(cuid())
  job        ScheduledJob @relation(fields: [jobId], references: [id], onDelete: Cascade)
  jobId      String
  trigger    String       // CRON | MANUAL
  actorId    String?
  status     String       // RUNNING | OK | ERROR
  error      String?
  meta       Json?
  startedAt  DateTime
  finishedAt DateTime?
  @@index([jobId, startedAt])
}

model MailCampaign {
  id           String    @id @default(cuid())
  name         String
  subject      String
  htmlBody     String
  audience     Json      // {kind:"ALL"} | {kind:"ROLE",roleKey} | {kind:"EVENT",eventId}
  scheduleKind String    // ONCE | CRON
  runAt        DateTime?
  cronExpr     String?
  timezone     String    @default("America/Santiago")
  status       String    @default("DRAFT") // DRAFT|SCHEDULED|SENDING|DONE|FAILED|CANCELLED
  nextRunAt    DateTime?
  lastRunAt    DateTime?
  sentCount    Int       @default(0)
  failCount    Int       @default(0)
  createdBy    Person    @relation(fields: [createdById], references: [id])
  createdById  String
  runs         MailCampaignRun[]
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt
}

model MailCampaignRun {
  id         String                @id @default(cuid())
  campaign   MailCampaign          @relation(fields: [campaignId], references: [id], onDelete: Cascade)
  campaignId String
  trigger    String                // CRON | MANUAL
  status     String                // RUNNING | OK | ERROR | CANCELLED
  sentCount  Int                   @default(0)
  failCount  Int                   @default(0)
  startedAt  DateTime
  finishedAt DateTime?
  recipients MailCampaignRecipient[]
}

model MailCampaignRecipient {
  id       String          @id @default(cuid())
  run      MailCampaignRun @relation(fields: [runId], references: [id], onDelete: Cascade)
  runId    String
  personId String
  status   String          @default("PENDING") // PENDING | SENT | FAILED | SKIPPED
  sentAt   DateTime?
  error    String?
  @@unique([runId, personId])
}
```

`Person` gana relaciones `mailCampaigns` (createdBy) — nada más.

## API

```
GET    /api/admin/jobs                          → ScheduledJob[]
PATCH  /api/admin/jobs/:key                     → {cronExpr?, timezone?, enabled?}
POST   /api/admin/jobs/:key/run                 → JobRun (async, 409 si RUNNING)
GET    /api/admin/jobs/:key/runs?take=50        → JobRun[]

GET    /api/admin/mail-campaigns                → MailCampaign[]
POST   /api/admin/mail-campaigns                → crear (DRAFT | SCHEDULED)
GET    /api/admin/mail-campaigns/audience-count → ?kind=&roleKey=&eventId= → {count}
GET    /api/admin/mail-campaigns/:id            → detalle + últimos runs
PATCH  /api/admin/mail-campaigns/:id            → editar (DRAFT|SCHEDULED)
POST   /api/admin/mail-campaigns/:id/test       → copia al email del admin
POST   /api/admin/mail-campaigns/:id/run        → corrida manual
POST   /api/admin/mail-campaigns/:id/cancel     → CANCELLED
GET    /api/admin/mail-campaigns/:id/runs       → runs + contadores
```

## Módulos

- `src/jobs/` nuevo: `JobsModule` (@Global — convención StorageModule),
  provee `JOB_REGISTRY`, `JobsService`, `JobsRunner`.
- `src/mail/` nuevo: `MailModule` → `MailCampaignsService` +
  `MailCampaignsController`. Inyecta `MAILER` (puerto auth) y registra
  el job `mail.campaign_dispatch`.
- `AdminJobsController` en `src/admin/infrastructure/` (convención de
  la consola admin).
- Schedulers refactorizados (firma pública de su service intacta):
  `AcademiesScheduler`, `SubscriptionsScheduler`,
  `CrmTriggersScheduler`, `TicketsScheduler` → `registry.register()`
  en `onModuleInit` (ya no llaman `schedule()`).

## Frontend

- `/admin/jobs`: tabla/cards de jobs — label+key, badge Activo/Pausado
  /Huerfano/Error, cronExpr+tz legible, próxima corrida, último
  resultado; acciones: Editar horario (input + presets Diario 09:00 /
  Cada hora / Cada minuto...), Pausar|Reactivar, Correr ahora
  (confirm), historial expandible (runs: trigger, duración, error,
  meta).
- `/admin/campanas`: lista + crear/editar — nombre, asunto, textarea
  HTML + preview iframe sandbox, audiencia (Todos / Rol / Evento con
  count en vivo vía audience-count), programación (radio: una fecha-
  hora | recurrente cron + input), test-send, Programar, Cancelar.
- Cards en el hub `/admin`. i18n part nuevo `adminJobs.json`.
