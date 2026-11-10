# Proposal: admin-campaign-detail

## Why

`/admin/campanas` opera sin ficha: la card del listado no navega a
ninguna parte y las acciones de estado (probar envío, correr ahora,
cancelar) viven inline en cada card, lo que rompe el patrón de
consola (card clickeable → ficha; mutaciones de estado en la ficha).
El API ya expone `GET /admin/mail-campaigns/:id` (detalle + últimas
20 corridas) y `GET /admin/mail-campaigns/:id/runs` (historial con
conteo de destinatarios), así que el trabajo es 100% de front.

## What Changes

- **Nueva ficha** `/admin/campanas/[id]`: identidad de la campaña
  (nombre + estado), datos en `<dl>` (asunto, audiencia,
  programación, próxima/última corrida, contadores), preview del
  `htmlBody` en iframe sandbox, historial de corridas (trigger,
  estado, fechas, enviados/fallidos/destinatarios) y acciones de
  operación (probar / enviar ahora / cancelar con `ConfirmSheet`).
- **Listado**: cada card pasa a ser `<Link>` a la ficha y pierde sus
  botones inline; el listado solo navega (console-patterns §2-3). El
  filtro de status y el CTA "Nueva campaña" se conservan.
- **Edición**: la ficha enlaza a `/admin/campanas/nueva?edit=<id>`
  solo cuando la campaña es DRAFT/SCHEDULED (el API ya rechaza el
  resto con 409).
- **i18n**: claves nuevas `admin.campaigns.detail.*` y
  `admin.campaigns.runs.*` en los cuatro catálogos.
- **Docs**: `docs/qa-flows-inventory.md` sección campañas admin.

## Impact

- Affected specs: `console-crud-flows` (MODIFIED requisito de
  campañas admin + ADDED requisito de ficha).
- Affected code:
  `apps/web/src/app/[locale]/(app)/admin/campanas/page.tsx` (card →
  Link, sin acciones inline),
  `apps/web/src/app/[locale]/(app)/admin/campanas/[id]/page.tsx`
  (nuevo), `apps/web/src/i18n/parts/{,en/,fr/,pt-PT/}admin.json`,
  `docs/qa-flows-inventory.md`.
- Sin cambios de API ni de schema.
