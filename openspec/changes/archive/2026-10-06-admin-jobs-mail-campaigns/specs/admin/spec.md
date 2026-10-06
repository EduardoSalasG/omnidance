# Delta: admin (admin-jobs-mail-campaigns)

## ADDED Requirements

### Requirement: registro declarativo de jobs programados

El sistema SHALL mantener una fila `ScheduledJob` por cada trabajo
programado registrado en código (`JOB_REGISTRY`), con `key` única,
label, descripción, `cronExpr`, `defaultCron`, `timezone`, `enabled`,
`orphaned` y contadores de última corrida. En bootstrap se hace upsert
por key: los jobs nuevos se crean con su default y los existentes solo
actualizan metadatos - el `cronExpr`/`enabled`/`timezone` editados por
el admin NUNCA se sobrescriben. Un job cuyo key desaparece del
registry queda `orphaned` (visible, sin historial borrado, no corre).

#### Scenario: bootstrap registra los jobs del sistema

- **WHEN** la API arranca
- **THEN** existen filas `ScheduledJob` para los jobs registrados en
  código (renewal reminders, subscriptions reconcile, CRM triggers,
  tickets day-of, mail campaign dispatch) con sus defaults de cron

#### Scenario: re-boot no pisa la edición del admin

- **WHEN** el admin editó el `cronExpr` o pausó un job y la API
  reinicia
- **THEN** el upsert conserva `cronExpr`/`enabled`/`timezone` de la DB
  y solo refresca label/descripción/defaultCron

#### Scenario: handler eliminado del código

- **WHEN** un `ScheduledJob.key` ya no está en el registry tras un
  deploy
- **THEN** el job queda `orphaned: true`, no se ejecuta y su
  historial se conserva

### Requirement: ejecución centralizada con historial

El sistema SHALL ejecutar los jobs desde un runner central (tick por
minuto) que dispara todo job `enabled && !orphaned && nextRunAt <=
now`, calculando `nextRunAt` con su `cronExpr` y `timezone`. Cada
corrida persiste un `JobRun` (RUNNING→OK|ERROR, trigger, actorId en
manuales, duración y meta de contadores) y actualiza
lastRunAt/lastStatus/lastError/runCount del job. Un job vencido
mientras el proceso estaba detenido corre una vez al arrancar
(catch-up), no salta corridas.

#### Scenario: job vencido corre y registra resultado

- **WHEN** un job enabled tiene `nextRunAt <= now` al tick
- **THEN** se crea un `JobRun` RUNNING, corre el handler, el run
  termina OK con meta o ERROR con mensaje, y `nextRunAt` se recalcula

#### Scenario: servidor caído a la hora programada

- **WHEN** la API estuvo detenida durante el horario de un job y
  reinicia
- **THEN** el primer tick detecta `nextRunAt` vencido y ejecuta el
  job una vez

#### Scenario: job pausado nunca corre

- **WHEN** un job tiene `enabled: false`
- **THEN** el tick lo ignora aunque su `nextRunAt` esté vencido; al
  reactivarlo se recalcula `nextRunAt` al futuro (sin catch-up de
  corridas perdidas por pausa)

### Requirement: consola admin de jobs

El admin SHALL ver todos los jobs con su horario, próxima corrida y
último resultado, y MUST poder editar `cronExpr`/`timezone`, pausar/
reactivar, disparar una corrida manual y ver el historial de corridas
- todo bajo `admin.access` y auditado en `AuditLog`.

#### Scenario: editar el horario de un job

- **WHEN** `PATCH /admin/jobs/:key` con un `cronExpr` válido
- **THEN** el job guarda la expr y `nextRunAt` recalculado; una expr
  inválida responde 400 sin tocar el job

#### Scenario: corrida manual

- **WHEN** `POST /admin/jobs/:key/run` sin corrida activa
- **THEN** se crea un `JobRun` MANUAL con actorId del admin y el
  handler corre en background; si ya hay un run RUNNING responde 409

#### Scenario: historial visible

- **WHEN** `GET /admin/jobs/:key/runs`
- **THEN** devuelve las corridas recientes con status, trigger,
  duración, error y meta
