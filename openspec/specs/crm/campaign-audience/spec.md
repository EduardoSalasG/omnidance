# crm/campaign-audience Specification

## Purpose
TBD - created by archiving change academy-audience-groups. Update Purpose after archive.

## Requirements

### Requirement: Criterios de audiencia propios de academia

`CampaignSegment` SHALL admitir `allStudents`, `enrollmentStatus`,
`planId` y `seriesId` — solo válidos con `actorType: "ACADEMY"` (400
BAD_REQUEST en otro actor o si plan/serie no pertenecen a la academia).
Los criterios se unen (OR) con los existentes (segment/tags/personIds).

#### Scenario: todos los alumnos

- **WHEN** `sendCampaign` resuelve `{allStudents: true}` para una academia
- **THEN** la audiencia incluye toda persona con `Enrollment` en esa
  academia (cualquier estado)

#### Scenario: por estado de inscripción

- **WHEN** el segmento lleva `enrollmentStatus: ["TRIAL"]`
- **THEN** la audiencia son las personas con `Enrollment` TRIAL en la
  academia

#### Scenario: por plan y por serie

- **WHEN** el segmento lleva `planId` → personas con `Enrollment` de ese
  plan en la academia; `seriesId` → personas con `ClassBooking` no
  CANCELLED en clases de esa serie

#### Scenario: actor equivocado

- **WHEN** el segmento lleva criterios de academia con `actorType:
  "PRODUCER"` → 400

### Requirement: Preview de audiencia

`POST /crm/campaigns/preview` SHALL resolver el segmento y responder
`{count}` sin crear campaña ni enviar notificaciones, bajo el mismo
`assertActorAccess` que campaigns.

#### Scenario: conteo sin envío

- **WHEN** el owner postea `{segment: {enrollmentStatus: ["TRIAL"]}}`
- **THEN** responde `{count: N}` y no se crea Campaign ni Notification

#### Scenario: audiencia vacía

- **WHEN** el segmento no alcanza a nadie → `{count: 0}`

### Requirement: UI de grupos en el formulario

El form de campaña SHALL ofrecer para actor ACADEMY: chip "todos los
alumnos", chips de estado de inscripción, selectores de plan y serie,
picker de personas (checkboxes → `personIds`), y contador de audiencia
via preview antes de crear.

#### Scenario: preview visible

- **WHEN** el owner marca criterios de grupo
- **THEN** el form muestra el conteo de alcanzados sin enviar

### Requirement: personIds restringido al universo del actor

Al resolver `personIds`, la audiencia SHALL intersectar los ids con el
universo del actor: `RelationshipScore` ∪ `ActorTag` del actor; para
`actorType: "ACADEMY"` además `Enrollment` ∪ `ClassBooking` de la
academia. Un `personId` fuera del universo se descarta sin error.

#### Scenario: id ajeno descartado

- **WHEN** el segmento lleva `personIds` con un id sin score, tag,
  enrollment ni booking del actor
- **THEN** esa persona no entra a la audiencia (ni error ni notificación)

#### Scenario: id alcanzable por tag

- **WHEN** el segmento lleva `personIds` con un id que el actor tiene
  taggeado
- **THEN** la persona entra a la audiencia aunque no tenga score

#### Scenario: alumno inscrito alcanzable

- **WHEN** actor ACADEMY y `personIds` incluye un inscrito sin score/tag
- **THEN** el inscrito entra a la audiencia
