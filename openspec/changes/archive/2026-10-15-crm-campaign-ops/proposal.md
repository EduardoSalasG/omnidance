# Proposal: crm-campaign-ops

## Why

Tres gaps de operación diaria del CRM (análisis vs industria): etiquetar
N personas exige N fichas; las campañas solo se envían a mano, sin
programación; y tras enviar no hay forma de saber si funcionó.

## What Changes

- **Bulk actions en personas**: `POST /crm/people/tags/bulk
  {personIds, tag, op: add|remove}` y selección múltiple en
  `/crm/personas` (etiquetar selección, crear campaña a los
  seleccionados).
- **Campaña programada**: `Campaign.scheduledAt` + status `SCHEDULED`
  + job `crm.campaigns` (cada 5 min) que envía las vencidas;
  `POST /crm/campaigns/:id/cancel` vuelve SCHEDULED→DRAFT.
- **Atribución de campaña**: `GET /crm/campaigns/:id` responde
  `metrics`: `sent`, `redemptions` (pagos PAID con el código creado) y
  `engaged` (miembros de la audiencia enviada con actividad en el
  universo del actor tras el envío). `result.audienceIds` persiste la
  audiencia materializada al enviar.

## Out of scope

- Canal WhatsApp y digest semanal (slice C).
- Métricas de apertura/clic (no medibles en push).
