# Proposal: crm-dynamic-segments

## Why

El actor hoy solo tiene 4 segmentos computados fijos y filtros ad-hoc;
no puede nombrar *su* realidad ("alumnos con plan mensual que dejaron de
venir", "asistentes que compraron 3+ preventas"). Los segmentos
dinámicos guardados son la pieza central del CRM en la industria
(Klaviyo/HubSpot): una regla nombrada que se evalúa sola y alimenta
listas, campañas y automatización. Ya tenemos las señales persistidas en
`RelationshipScore.breakdown` + `ActorTag`; falta la entidad.

## What Changes

- **Nuevo modelo `ActorSegment`** (actor-scoped, `@@unique(actorType,
  actorId, name)`): `{name, rules Json}`; lista de condiciones
  `{field, op, value}` con match `all|any`. Campos: score, segment,
  attendanceRecent, weeklyStreak, monthsContinuous, purchases,
  earlyPurchases, tenure, referrals, spend, tag.
- **`ActorSegmentMembership` materializada** (`@@unique(segmentId,
  personId)`, `since`): se recomputa en el mismo paso del recompute de
  scores → las entradas/salidas son eventos detectables.
- **Triggers custom** `SEGMENT_ENTER`/`SEGMENT_EXIT` con config
  `{segmentId, action}`; acciones `NOTIFY` (a la persona), `TAG_ADD`/
  `TAG_REMOVE` y `NOTIFY_OWNER` (al dueño del actor).
- **Audiencias reusan el segmento**: `GET /crm/people?segmentId=` y
  `CampaignSegment.segmentRef` resuelven contra la membresía
  materializada.
- **API**: CRUD `/crm/segments`, `POST /crm/segments/preview`
  (count+muestra sin guardar), `GET /crm/segments/:id/people`.
- **Front `/crm/segmentos`**: lista con conteos, builder de reglas
  (filas campo/op/valor), detalle de miembros; item en `CrmNav`.
  Filtro de personas por segmento guardado.

## Out of scope

- Orquestador de flujos multi-paso (journeys); el trigger
  enter/exit cubre el 80% del valor.
- Bulk actions / scheduling / atribución de campañas (slice B).
- WhatsApp / digest semanal (slice C).
