# academy-invite-push-consume

## Why

La invitación de academia a una **cuenta existente** llega por dos
canales: correo con magic link (cubierto por verify: consume +
lente academy) y notificación push `academy.invite`. El canal push
está incompleto: el tap en `/notificaciones` solo marca leída y no
navega (el tipo no está en `hrefFor` y el payload no trae
`data.path`), no setea la lente academy y nunca consume la
invitación. Si la persona entra por el push en vez del correo, la
academia la ve "pendiente" para siempre y se pierde el Referral de
atribución.

## What Changes

- `POST /academies/invites/:inviteId/consume` (SessionGuard): consume
  la invitación pendiente del propio usuario autenticado (valida
  `invite.email === person.email`), mismo efecto que el verify:
  `consumedAt` + `personId`, `Referral` INVITE con dedup y evento
  `invite.registered`. Idempotente sobre invitación ya consumida.
- La lógica de consumo se extrae de `AuthController` a un helper
  compartido para reusarla en ambos caminos sin duplicar.
- `hrefFor` en `/notificaciones`: `academy.invite` deep-linkea a
  `/academias/<academyId>` (mismo destino que el `next` del magic
  link).
- Al tocar la notificación `academy.invite`: consume best-effort +
  `setViewMode("academy")` (equivalente al efecto de la cookie
  `omnidance_lens`, sin necesidad de cookie porque ya hay sesión) +
  navegación a la ficha.

## Capabilities

### New Capabilities

(ninguna)

### Modified Capabilities

- `academies/student-invites`: el camino push para cuentas
  existentes consume la invitación y aterriza en la ficha con lente
  academy, equivalente al verify del magic link.

## Impact

- API: `AcademyInvitesController` (endpoint nuevo), helper de
  consumo extraído de `AuthController` (mismo comportamiento, sin
  cambio de contrato del verify).
- Web: `notificaciones/page.tsx` (hrefFor + side-effect del tap).
- Sin cambios de schema ni de payload de la notificación (ya trae
  `academyId` e `inviteId`).
