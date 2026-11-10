# academies/student-invites

## MODIFIED Requirements

### Requirement: Consumo por notificación push (cuenta existente)

La notificación `academy.invite` SHALL ser un camino de llegada
equivalente al magic link para la cuenta existente, por tres vías que
convergen en el mismo efecto:

- Tap in-app (centro `/notificaciones` o toast en tiempo real):
  consume la invitación pendiente del propio usuario vía `POST
  /academies/invites/:inviteId/consume`, persiste `viewMode=academy`
  (mismo efecto que la cookie `omnidance_lens` del verify) y navega a
  la ficha pública `/academias/:academyId`.
- Push de dispositivo: el payload SHALL llevar `data.url` apuntando a
  la ruta bridge `/i/:inviteId` (no a la ficha directo, porque eso
  saltaría el consumo). La página bridge SHALL llamar al mismo
  endpoint de consumo (best-effort), persistir `viewMode=academy` y
  reemplazar la navegación hacia `/academias/:academyId` usando el
  `academyId` de la respuesta; si el consumo responde 404/401 SHALL
  caer a `/notificaciones`.

`POST /academies/invites/:inviteId/consume` (SessionGuard) SHALL
validar que `invite.email === person.email`, responder `{consumed,
academyId}` y aceptar un `channel` opcional en el body (`push` para
el tap in-app, `device` para la ruta bridge; default `push`). El
consumo SHALL tener el mismo efecto que el del verify: `consumedAt` +
`personId`, `Referral` INVITE (dedup por referrer+referred+source) y
`invite.registered`. El evento `invite.registered` SHALL registrar el
camino de llegada en `data.channel`: `magic_link` (verify del correo),
`push` (tap in-app) o `device` (push de dispositivo); los eventos
previos sin `channel` se interpretan como `magic_link` (era el único
camino). El endpoint SHALL ser idempotente sobre invitación ya
consumida y SHALL rechazar (404) una invitación de otro email.

#### Scenario: tap en el push consume y abre la ficha

- **GIVEN** una persona con cuenta existente y una `AcademyInvite`
  pendiente con notificación `academy.invite`
- **WHEN** toca la notificación en `/notificaciones` o en el toast en
  tiempo real
- **THEN** la invitación queda consumida (`consumedAt` +
  `personId`, `Referral` INVITE, `invite.registered` con
  `channel=push`), su `viewMode` persiste `academy` y navega a
  `/academias/:academyId`

#### Scenario: push de dispositivo abre la ruta bridge

- **GIVEN** una persona con sesión y una notificación push de
  dispositivo `academy.invite` (`data.url = /i/:inviteId`)
- **WHEN** toca la notificación del sistema operativo
- **THEN** se abre `/i/:inviteId`, la página consume la invitación
  (`invite.registered` con `channel=device`), persiste
  `viewMode=academy` y aterriza en `/academias/:academyId`

#### Scenario: bridge con invitación no consumible

- **WHEN** la página bridge recibe 404 (invite de otro email o
  inexistente) o 401 (sin sesión) al consumir
- **THEN** reemplaza la navegación hacia `/notificaciones`

#### Scenario: consumo idempotente

- **GIVEN** una invitación ya consumida (por cualquier camino)
- **WHEN** se llama `POST /academies/invites/:inviteId/consume`
- **THEN** responde `{consumed: false, academyId}` sin duplicar
  `Referral` ni evento

#### Scenario: invitación de otra persona

- **WHEN** se llama `POST /academies/invites/:inviteId/consume` con
  un `inviteId` cuyo `email` no corresponde a la persona autenticada
- **THEN** responde 404 y no consume nada

#### Scenario: registro por magic link registra su canal

- **WHEN** la persona verifica el magic link del correo de invitación
- **THEN** el `invite.registered` emitido lleva
  `data.channel = "magic_link"`
