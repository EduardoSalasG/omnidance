# mail-campaign-context-audiences

## Why

Las campañas de mail (`admin-jobs-mail-campaigns`) envían el mismo HTML
estático a todos los destinatarios. Eso alcanza para anuncios genéricos,
pero no para el caso motivante del admin: **recordatorios tipo
"vencimiento del plan"**, donde cada persona debe recibir SU academia,
SU plan y SU fecha. Además, un recordatorio recurrente diario sin dedup
le re-enviaría el mail al mismo alumno cada día hasta que su plan venza.

## What Changes

- **Variables de plantilla**: `{{nombre}}`, `{{email}}` siempre
  disponibles; el cuerpo y asunto se interpolan por destinatario.
  Variables desconocidas para la audiencia elegida → 400 al guardar.
- **Audiencias con contexto** (cada destinatario resuelve su propio
  payload de variables):
  - `ENROLLMENTS_EXPIRING` `{days}`: inscripciones ACTIVE/ONLINE con
    `endsAt` en `[now, now+days)` → vars `academy`, `plan`, `endsAt`.
  - `ENROLLMENTS_EXPIRED` `{days}`: `endsAt` en `[now-days, now)`
    (gracia) → mismas vars.
  - `PLATFORM_SUB_EXPIRING` `{days}`: suscripciones de plataforma con
    `nextInvoiceAt` en `[now, now+days)` → vars `plan` (tier),
    `nextInvoiceAt`.
- **Dedup por ciclo** (`MailCampaignSent`, `@@unique(campaignId,
  dedupKey)`): una audiencia con contexto marca cada destinatario con
  `dedupKey` (`enr:<id>:<endsAt>` / `psub:<id>:<nextInvoiceAt>`); un
  cron diario no re-envía al mismo alumno por el mismo ciclo — al
  renovar cambia `endsAt` y el recordatorio se rearma. Las audiencias
  genéricas (ALL/ROLE/EVENT) no tienen dedupKey: cada corrida envía a
  todos (semántica de newsletter).
- El test-send sustituye variables con el primer destinatario real
  resuelto (o placeholders si la audiencia está vacía).

## Impact

- `apps/api/prisma/schema.prisma`: +`MailCampaignSent`. Migración.
- `apps/api/src/mail/`: service (resolución con ctx, interpolación,
  dedup), controller (AudienceDto + `days`).
- `apps/web/src/app/(app)/admin/campanas/`: opciones de audiencia,
  input `days`, hint de variables disponibles.
- Sin cambios de contrato para las audiencias existentes.
