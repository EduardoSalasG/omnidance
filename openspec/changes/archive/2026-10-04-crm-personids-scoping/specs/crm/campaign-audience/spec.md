# campaign-audience — delta: scoping de personIds

## ADDED Requirements

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
