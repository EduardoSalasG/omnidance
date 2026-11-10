# Design: admin-campaign-detail

## Contexto

El API ya entrega todo lo que la ficha necesita:

- `GET /admin/mail-campaigns/:id` → campaña completa (`htmlBody`,
  `audience`, `scheduleKind/runAt/cronExpr/timezone`, `status`,
  `nextRunAt`, `lastRunAt`, `sentCount`, `failCount`, `createdAt`)
  con las últimas 20 corridas embebidas.
- `GET /admin/mail-campaigns/:id/runs` → hasta 50 runs desc con
  `_count.recipients` (el detalle embebido no trae ese conteo).
- `POST :id/test | :id/run | :id/cancel` → acciones existentes.

## Decisiones

1. **Dos fetches en paralelo** (`get` + `listRuns`): el detalle no
   trae `_count.recipients` por run y el historial en ficha quiere
   "N destinatarios" por corrida. Costo: una request extra liviana.
2. **Card del listado → Link a ficha**: se retiran los botones
   inline (edit/test/run/cancel). Es el cambio de comportamiento
   principal: las acciones pasan a la ficha, que es lo que la
   spec/pendiente pedía. El `ConfirmSheet` y los handlers de acción
   se mueven de la página lista a la ficha.
3. **Header desnudo navegable a editar** (console-patterns §3): el
   bloque identidad (nombre + subject + badge de estado) es `Link`
   a `/admin/campanas/nueva?edit=<id>` solo cuando
   `status ∈ {DRAFT, SCHEDULED}`; con otros estados el header se
   queda estático (el API rechaza editar el resto).
4. **Preview del htmlBody**: `<details>` + iframe `sandbox=""` +
   `srcDoc`, mismo patrón que `CampaignForm` (documento de email,
   `bg-white` literal).
5. **Historial de runs**: lista con `LIST_PREVIEW` (5) + `SeeAllRow`;
   el endpoint acota a 50. Cada fila: fecha inicio, badge trigger,
   badge estado, `sent ✓ / fail ✗` y "N destinatarios".
6. **Acciones**: `test` = ghost inmediato; `run` = ghost +
   `ConfirmSheet`; `cancel` = zona destructiva al pie
   (`border-t`, ghost red) + `ConfirmSheet`, solo si
   `status ∈ {DRAFT, SCHEDULED, SENDING}` (misma regla `cancellable`
   que hoy). `run` se deshabilita en SENDING/CANCELLED (regla actual).
   Feedback por `ActionNotice`; tras éxito se re-fetchean detalle y
   runs.
7. **Estados**: loading `SkeletonCard`; error de carga `role="alert"`
   + retry; 404 → estado "no encontrada" con CTA al listado;
   `AdminGate` mantiene sus propios estados.
8. **Tipos**: `Campaign` ya existe en `campaign-form.tsx`; se añade
   `CampaignRun` (id, trigger, status, sentCount, failCount,
   startedAt, finishedAt, recipientsCount) local a la ficha.
9. **i18n**: claves nuevas bajo `admin.campaigns.detail.*`
   (notFound, back, lastRun, nextRun, createdAt, preview, recipients,
   sentVsFail) y `admin.campaigns.runs.*` (title, empty, trigger.CRON/
   MANUAL, status.RUNNING/OK/ERROR/CANCELLED, started, finished). Los
   catálogos vivos son 4 (es-CL + en + fr + pt-PT) por el merge de
   parts - se agregan en todos para que `i18n-audit` quede
   `ALL_KEYS_OK`. Se reutilizan las claves existentes de acciones,
   confirmaciones, status de campaña y audience.

## Riesgos

- Pérdida de conveniencia (acciones a un click extra): aceptado por
  el patrón de consola; el pendiente pedía explícitamente la ficha
  para run/test/cancel.
- `run` en una campaña CRON activa: el botón existe igual que antes
  (corrida manual ad-hoc, no desactiva el cron) - sin cambio de
  semántica.
