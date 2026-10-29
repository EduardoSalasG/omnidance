# Tasks: crm-dynamic-segments

## 1. Datos

- [x] Modelos `ActorSegment` + `ActorSegmentMembership` + migración.
- [x] Seed: ningún default requerido (los segmentos son del actor).

## 2. Dominio

- [x] `evalRules(rules, ctx)`: match all|any sobre campos de actividad/
      score/tags; validación de reglas al crear/editar (campos y ops
      permitidos).
- [x] `syncSegmentMemberships(actorType, actorId, activityMap)`:
      evalúa segmentos del actor → diff con `ActorSegmentMembership`
      → creates/deletes + devuelve `{enters, exits}` por segmento.
      Corre dentro de `recomputeScores` (job diario + manual).
- [x] Triggers `SEGMENT_ENTER`/`SEGMENT_EXIT` (config `{segmentId,
      action}`): acciones `NOTIFY` (persona), `TAG_ADD`/`TAG_REMOVE`,
      `NOTIFY_OWNER` (Academy.ownerId | actorId para PRODUCER). Dedup
      por (persona, segmento, dirección, día) vía Notification.
- [x] `GET /crm/people?segmentId` restringe a miembros;
      `CampaignSegment.segmentRef` resuelve miembros en la audiencia.

## 3. API

- [x] `GET /crm/segments` (conteo de miembros), `POST`, `PATCH`,
      `DELETE`.
- [x] `POST /crm/segments/preview` → {count, sample}.
- [x] `GET /crm/segments/:id/people` → lista paginada con person.
- [x] Trigger form/backend acepta nuevas keys + config.

## 4. Web

- [x] `/crm/segmentos`: lista + create/edit (builder de reglas) +
      detalle de miembros. `CrmNav` + item.
- [x] `people-table`: opción de filtrar por segmento guardado.
- [x] `trigger-form`: opciones SEGMENT_ENTER/EXIT + selector de
      segmento + acción.
- [x] i18n `crm.segments.*` nuevas + campos/ops etiquetados.

## 5. Verificación + docs

- [x] Specs vitest: evalRules, sync diff, trigger enter/exit con dedup,
      people?segmentId, preview.
- [x] tsc api+web, vitest, openspec validate, architecture.md +
      omni-dance.md, archivar.
