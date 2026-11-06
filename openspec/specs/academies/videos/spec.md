# academies/videos Specification

## Purpose
TBD - created by archiving change videos-ficha-edit. Update Purpose after archive.

## Requirements

### Requirement: Detalle de video por id con máscara locked

`GET /academies/:id/videos/:videoId` SHALL responder el video completo
al staff (canManageAcademy) y a cualquier caller cuando el video no es
restringido; para el resto SHALL aplicar la misma máscara del listado
(`academies/console-lists`): url visible solo si asistió a la Class
asociada o tiene enrollment ACTIVE; si no, metadatos + `locked: true`
sin url. Video inexistente o de otra academia SHALL responder 404.

#### Scenario: Staff ve el detalle completo

- **WHEN** un owner/staff pide `GET /academies/:id/videos/:videoId`
- **THEN** recibe el video con url, sin máscara

#### Scenario: Alumno sin acceso recibe metadatos bloqueados

- **GIVEN** un video restringido cuya Class el alumno no asistió
- **WHEN** el alumno pide el detalle
- **THEN** recibe `locked: true` sin url

### Requirement: Actualización de video con gate de mutación

`PATCH /academies/:id/videos/:videoId` SHALL exigir la misma cap de
escritura del create (`schedule`/`videos`, solo owner/ADMIN) y SHALL
aceptar `title`, `url`, `classId` y `restrictedToAttended` opcionales.
`classId` con string SHALL validarse contra las clases de la academia
(404 si no pertenece); `classId: null` SHALL desvincular el video de su
clase sin consulta. Video inexistente o de otra academia SHALL
responder 404.

#### Scenario: Edición feliz

- **WHEN** un owner hace `PATCH` con `title` nuevo
- **THEN** el video persiste el cambio y se devuelve actualizado

#### Scenario: classId de otra academia

- **WHEN** el `classId` del body pertenece a otra academia
- **THEN** responde 404 sin mutar el video

### Requirement: Ficha de video como página de edición dedicada

`/academia/videos/[id]` SHALL resolver el video con el endpoint de
detalle por id (no recorriendo el listado paginado) y SHALL renderizar
el formulario de video precargado para quien puede administrar
(owner/ADMIN): mismo conjunto de campos del alta (title, url, classId,
restrictedToAttended) con submit `PATCH`. La zona destructiva con
delete SHALL vivir al pie de la misma ficha. Callers sin permiso de
administración SHALL ver el estado "sin acceso"; el listado sigue
enviando a los viewers directo al link externo.

#### Scenario: Owner edita desde la ficha

- **GIVEN** un owner en `/academia/videos/[id]`
- **WHEN** cambia el título y guarda
- **THEN** se emite `PATCH`, el resultado se comunica con ActionNotice
  y la ficha refleja el dato actualizado

#### Scenario: Video inexistente

- **WHEN** el detalle responde 404
- **THEN** la ficha muestra el estado "no encontrado" con CTA al
  listado

### Requirement: Módulo de videos detrás del flag academy_videos

La superficie de videos de academia SHALL estar gateada por el flag
`academy_videos` del catálogo de funcionalidades (mapa público
`GET /features`, fail-closed: flag ausente = OFF). Con el flag OFF:
las páginas `/academia/videos`, `/academia/videos/nuevo` y
`/academia/videos/[id]` SHALL mostrar el estado "módulo desactivado"
en vez del contenido o del paywall de tier; la card "Videos" de la
grilla del hub `/academia` SHALL NOT renderizarse; y el ítem
`/academia/videos` del sidebar del owner SHALL ocultarse. El flag es
adicional al gate de tier `videos`: con el flag OFF ni una academia
PRO ve el módulo; con el flag ON aplica el gate de tier vigente
(`AcademyTierGate` + 403 `tier.required` del API). Los endpoints
`/academies/:id/videos*` SHALL NOT cambiar: el gate es de superficie,
igual que `academy_explore`.

#### Scenario: Flag OFF muestra estado desactivado

- **WHEN** el flag `academy_videos` está OFF y un miembro abre
  `/academia/videos`, `/academia/videos/nuevo` o `/academia/videos/[id]`
- **THEN** la página muestra el estado "módulo desactivado" en vez del
  listado, el form o la ficha, y nunca el TierPaywall

#### Scenario: Flag OFF oculta la card del hub

- **GIVEN** un staff de una academia PRO con cap `schedule`
- **WHEN** el flag `academy_videos` está OFF y abre el hub `/academia`
- **THEN** la grilla no lista la card de videos aunque el tier cubra
  la feature

#### Scenario: Flag OFF oculta el ítem del sidebar

- **WHEN** el flag `academy_videos` está OFF y el owner abre el
  sidebar de su consola
- **THEN** el ítem "Videos" no se lista (flag por ítem del nav, mismo
  mecanismo que `city_guides`)

#### Scenario: Flag ON conserva el gate de tier

- **WHEN** el flag `academy_videos` está ON (default del seed)
- **THEN** `/academia/videos*` opera como antes: PRO con cap entra,
  tiers sin la feature `videos` ven el TierPaywall y el API sigue
  respondiendo 403 `tier.required` como red de seguridad
