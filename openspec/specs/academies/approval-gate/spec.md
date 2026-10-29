# academies/approval-gate Specification

## Purpose
TBD - created by archiving change academy-approval-gate. Update Purpose after archive.

## Requirements

### Requirement: estado de revisión por academia

`Academy` SHALL persistir `reviewStatus` (`RoleStatus`:
PENDING/APPROVED/REJECTED, default PENDING) y `photoUrl` (URL externa,
nullable). La migración SHALL dejar toda academia existente en
APPROVED. Toda academia creada vía `POST /academies` SHALL nacer en
PENDING sin importar el estado del owner.

#### Scenario: nueva academia queda oculta

- **WHEN** un owner con rol ya APPROVED crea una academia
- **THEN** la academia nace con `reviewStatus = PENDING` y no aparece
  en ninguna superficie pública

#### Scenario: backfill no rompe el directorio

- **WHEN** corre la migración sobre una base con academias existentes
- **THEN** todas quedan APPROVED y el directorio público no pierde
  ninguna

### Requirement: checklist de publicación evaluado en servidor

El backend SHALL exponer un evaluador compartido que devuelve por
academia un mapa de checks booleanos: `name` (≥2 chars),
`description`, `address`, `contact` (instagram O whatsapp O website),
`photo` (`photoUrl` no vacío), `activeSeries` (≥1 ClassSeries activa),
`upcomingClass` (≥1 Class futura no cancelada), `plan` (≥1
MembershipPlan), `ownerApproved` (PersonRole ACADEMY_OWNER APPROVED
del ownerId). La evaluación SHALL hacerse en batch (groupBy), sin N+1.

#### Scenario: academia incompleta reporta lo que falta

- **GIVEN** una academia con descripción y dirección pero sin foto ni
  clases
- **WHEN** se evalúa el checklist
- **THEN** `photo`, `activeSeries`, `upcomingClass` y `plan` reportan
  false; el resto true

### Requirement: auto-aprobación al completar checklist

Una academia en PENDING cuyo checklist evalúa completo SHALL
considerarse pública y SHALL persistirse a APPROVED best-effort en el
mismo request. Una academia REJECTED SHALL permanecer oculta aunque el
checklist esté completo; solo admin la restaura.

#### Scenario: dueño completa datos y la academia sale sola

- **GIVEN** una academia PENDING a la que solo le falta `photoUrl`
- **WHEN** el owner guarda el photoUrl vía settings PATCH
- **THEN** una consulta pública posterior la lista (y su status queda
  persistido APPROVED)

#### Scenario: rechazada no revive sola

- **GIVEN** una academia REJECTED por admin con checklist completo
- **WHEN** se consultan los directorios públicos
- **THEN** sigue oculta hasta que admin la re-apruebe

### Requirement: filtro de visibilidad en superficies públicas

Solo academias visibles (APPROVED, o PENDING con checklist completo)
SHALL aparecer en `GET /academies`, `GET /academies/public` y
`GET /classes/browse`. `GET /academies/:id/profile` SHALL responder
404-equivalente para viewers sin privilegios de gestión sobre una
academia no visible; owners/staff/instructores siempre la ven.

#### Scenario: /clases deja de filtrar clases ocultas

- **WHEN** una academia PENDING tiene series y clases futuras
- **THEN** `/classes/browse` no las incluye hasta que la academia sea
  visible

#### Scenario: link directo a ficha oculta

- **WHEN** un bailarín abre `/academias/{id}` de una academia PENDING
- **THEN** la API responde como si no existiera; el owner/staff sí la
  abre normal

### Requirement: card de visibilidad en la consola del owner

`GET /academies/:id` SHALL incluir `reviewStatus` y el `checks`
evaluado. La consola `/academia` SHALL mostrar una card de visibilidad
con el estado (En revisión / Publicada / Rechazada) y, si falta algo,
la lista de ítems pendientes con link a la sección que los resuelve
(perfil, series/clases, planes).

#### Scenario: dueño ve qué le falta

- **WHEN** el owner abre `/academia` con una academia PENDING sin foto
  ni plan
- **THEN** la card muestra "En revisión" con los ítems faltantes
  enlazando a configuracion/perfil y a planes

#### Scenario: aprobada muestra estado publicada

- **WHEN** la academia queda APPROVED
- **THEN** la card muestra estado "Publicada" sin ítems pendientes

### Requirement: foto de academia vía URL externa

`photoUrl` SHALL ser editable en `PATCH /academies/:id/settings` y en
la página `/academia/configuracion/perfil`. El campo SHALL aceptar dos
orígenes: una URL externa https (input manual; regla "fotos nunca
hosteadas" para contenido externo) o un path hosteado `/api/...`
proveniente del upload propio (`POST /academies/:id/photo`). Guardar el
perfil con un `photoUrl` hosteado SHALL NOT rechazarlo. SHALL
exponerse en `GET /academies/:id/profile` cuando esté aprobada.

#### Scenario: guardar foto

- **WHEN** el owner pega una URL https de imagen en el campo foto
- **THEN** se persiste `photoUrl`, el check `photo` pasa a true y la
  ficha pública la usa como imagen principal

#### Scenario: guardar perfil tras subir foto

- **WHEN** el owner subió la foto (photoUrl quedó `/api/academies/photos/<key>`)
  y guarda el formulario de perfil
- **THEN** el PATCH no rechaza el path hosteado; la foto persiste y el
  resto de campos se guardan
