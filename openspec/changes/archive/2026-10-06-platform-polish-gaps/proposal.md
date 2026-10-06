# platform-polish-gaps

## Why

Tras `admin-jobs-mail-campaigns` + `mail-campaign-context-audiences`
quedaron gaps declarados que bloquean el uso serio de la consola de
jobs/campañas en producción:

- **Sin opt-out**: las campañas no ofrecen baja de suscripción — un
  requisito básico si el admin manda avisos a toda la base.
- **Un mail por persona, no por contexto**: una persona con N
  inscripciones por vencer recibe un solo recordatorio (con el ctx de
  la primera); el ciclo correcto es un aviso por ciclo.
- **Runner sin claim atómico**: `tick`/`runNow` leen `runningRunId`
  antes de tomarlo — con 2 instancias de API ambas podrían correr el
  mismo job a la vez.
- **Selector de eventos acotado**: el formulario de campañas solo lista
  los ~50 eventos PUBLISHED más recientes, sin búsqueda ni eventos
  pasados (caso típico: mail post-evento).
- **Sin recordatorio de comprobantes**: el owner de academia puede
  dejar claims `PENDING` sin validar indefinidamente — la audiencia
  `CLAIMS_PENDING` lo hace configurable como campaña.

Además el flujo de pagos manuales (`academy-checkout-manual-pay`) no
tiene e2e del ciclo intent→receipt→approve.

## What Changes

- **Opt-out de campañas**: `Person.mailOptOutAt`. Todo envío de
  campaña agrega footer con link firmado
  `GET /api/mail/unsubscribe?p=<personId>&t=<hmac(JWT_SECRET)>` (ruta
  pública, HTML de confirmación). Las audiencias excluyen personas con
  opt-out al resolver y al enviar.
- **Recipient por contexto**: `MailCampaignRecipient.dedupKey` +
  `@@unique(runId, personId, dedupKey)` — las audiencias con dedupKey
  generan un recipient por contexto (una persona con 2 planes por
  vencer recibe 2 mails, cada uno con su ctx); las genéricas siguen
  deduplicando por persona.
- **Claim atómico de job**: `execute()` toma `runningRunId` con
  `updateMany(id, runningRunId IS NULL)`; perder la carrera aborta la
  corrida (MANUAL → 409, CRON → skip), multi-instancia seguro.
- **Selector de eventos con búsqueda**: el form consulta
  `GET /admin/browse/events?q=` sin filtro de status (la respuesta ya
  incluye status/fecha) — se ven eventos pasados y futuros, con
  búsqueda por nombre.
- **Audiencia `CLAIMS_PENDING {days}`**: owners de academia con claims
  `PENDING` más viejos que `days` días → vars `academy`, `count`;
  dedupKey `claims:<academyId>:<fecha-CL>` = máximo 1 recordatorio por
  academia por día mientras haya pendientes.
- **E2e del flujo manual de cobro**: intent (AWAITING, idempotente) →
  receipt (PENDING) → approve (payment + enrollment) + cancel +
  reanudación por `/claims/mine`.

## Impact

- `apps/api/prisma/schema.prisma`: `Person.mailOptOutAt`,
  `MailCampaignRecipient.dedupKey` + cambio de unique. Migración.
- `apps/api/src/mail/`: unsubscribe controller público, footer,
  filtrado de opt-outs, recipient por contexto, audiencia nueva.
- `apps/api/src/jobs/jobs.service.ts`: claim atómico.
- `apps/api/src/admin/…/browse.controller.ts`: sin cambios (ya soporta `q`).
- `apps/web/…/admin/campanas/page.tsx`: buscador de eventos, opción de
  audiencia nueva.
- `apps/api/test/academies.e2e.spec.ts`: ciclo AWAITING→PENDING→APPROVED.
