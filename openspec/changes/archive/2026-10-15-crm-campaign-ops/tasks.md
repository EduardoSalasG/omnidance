# Tasks: crm-campaign-ops

## 1. Datos + dominio

- [x] `Campaign.scheduledAt DateTime?` + migración.
- [x] `POST /crm/people/tags/bulk {personIds[], tag, op}` → crea/quita
      tags en lote (dedup add; count devuelto).
- [x] `createCampaign` acepta `scheduledAt` futuro → status `SCHEDULED`;
      `sendCampaign` acepta DRAFT y SCHEDULED; `cancelCampaign` vuelve
      SCHEDULED→DRAFT.
- [x] Job `crm.campaigns` (`*/5 * * * *`, Santiago): envía campañas
      SCHEDULED con scheduledAt ≤ now. Seed + registro ScheduledJob.
- [x] En `sendCampaign`: `result.audienceIds` persiste la audiencia.
- [x] `campaignDetail` (service) agrega `metrics`: redemptions
      (Payment PAID con `discountCodeId` del código de campaña,
      createdAt ≥ envío) y engaged (audiencia con checkin/attendance
      en el universo del actor tras el envío).

## 2. Web

- [x] `people-table`: checkbox por fila + barra de selección
      ("etiquetar N", "nueva campaña a seleccionados" →
      /crm/campanas/nueva?personIds=).
- [x] `campaign-form`: campo "programar envío" (datetime) → scheduledAt.
- [x] ficha de campaña: bloque métricas (enviados/redenciones/
      respondieron), botón cancelar programación en SCHEDULED, estado
      SCHEDULED en listado.
- [x] i18n nuevas keys.

## 3. Verificación + docs

- [x] Specs vitest: bulk add/remove idempotente, schedule→job envía,
      metrics redemptions/engaged.
- [x] tsc, vitest, openspec validate, architecture.md + omni-dance.md,
      archivar.
