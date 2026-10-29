# crm/segments Specification

## Purpose
TBD - created by archiving change crm-dynamic-segments. Update Purpose after archive.

## Requirements

### Requirement: Segmentos dinámicos guardados por actor

El actor SHALL poder definir `ActorSegment` propios: `{name, rules}`
scoped a `(actorType, actorId)` con nombre único por actor. `rules` =
`{match: "all"|"any", conditions: [{field, op, value}]}`. Campos
permitidos: `score`, `segment`, `attendanceRecent`, `weeklyStreak`,
`monthsContinuous`, `purchases`, `earlyPurchases`, `tenure`,
`referrals`, `spend`, `tag`. Ops numéricas `eq|neq|gt|gte|lt|lte`;
`segment` usa `eq|neq`; `tag` usa `present|absent` (value = nombre del
tag). La membresía SHALL materializarse en `ActorSegmentMembership
@@unique(segmentId, personId)` con `since`, recomputada en cada
`recomputeScores` del actor.

#### Scenario: crear y evaluar un segmento

- **GIVEN** un segmento `{match:"all", conditions:[{field:"score",op:"gte",value:60},{field:"attendanceRecent",op:"lte",value:2}]}`
- **WHEN** corre el recompute del actor
- **THEN** la membresía refleja exactamente las personas que cumplen
  todas las condiciones sobre sus últimos scores

#### Scenario: preview sin guardar

- **WHEN** `POST /crm/segments/preview {rules}` 
- **THEN** responde `{count, sample}` evaluando contra los scores
  actuales sin persistir nada

### Requirement: Eventos enter/exit y triggers

En cada recompute, el diff de membresía SHALL producir eventos
`segment.enter`/`segment.exit`. Los `CrmTrigger` con keys
`SEGMENT_ENTER`/`SEGMENT_EXIT` y config `{segmentId, action}` SHALL
ejecutar la acción por cada persona que entra/sale: `NOTIFY`
(notificación a la persona), `TAG_ADD`/`TAG_REMOVE` (aplicar/quitar
ActorTag) o `NOTIFY_OWNER` (notificación al owner del actor; para
ACADEMY `Academy.ownerId`, para PRODUCER el `actorId`). Dedup: máximo
una acción por `(persona, segmento, dirección, día)`.

#### Scenario: alumno entra al segmento "cayendo"

- **GIVEN** un trigger SEGMENT_ENTER sobre el segmento "cayendo" con
  acción NOTIFY
- **WHEN** un alumno entra al segmento en el recompute
- **THEN** recibe la notificación configurada; otro recompute el mismo
  día no la repite

#### Scenario: acción sobre el owner

- **GIVEN** un trigger SEGMENT_ENTER con acción NOTIFY_OWNER
- **WHEN** 5 personas entran al segmento
- **THEN** el owner recibe notificación agregada con el conteo

### Requirement: Segmento como audiencia reutilizable

`GET /crm/people?segmentId=` SHALL devolver solo miembros del segmento.
`CampaignSegment.segmentRef = <segmentId>` SHALL resolver la audiencia
de campaña a la membresía materializada (OR con el resto de criterios).

#### Scenario: filtrar el listado por segmento

- **WHEN** el actor filtra personas por un segmento guardado
- **THEN** ve solo sus miembros actuales

#### Scenario: campaña a un segmento guardado

- **WHEN** una campaña usa `segmentRef`
- **THEN** el destinatario se resuelve desde la membresía vigente al
  momento del envío
