## ADDED Requirements

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
