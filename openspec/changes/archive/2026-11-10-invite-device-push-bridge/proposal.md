# Proposal: invite-device-push-bridge

## Why

La notificación `academy.invite` tiene hoy dos caminos de consumo que
sí funcionan (magic link del correo y tap en centro/toast in-app),
pero el push de dispositivo cae al centro: el payload lleva
`{academyId, inviteId}` sin `url` y el service worker abre
`/notificaciones`. El invite sigue pendiente y la persona tiene que
encontrar la card y tocarla. Además el tap del toast no marca la
notificación como leída y el evento `invite.registered` no registra
por qué canal llegó el registro, lo que bloquea la métrica
invite→registrada por canal (estrategia §7.5).

## What Changes

- La push `academy.invite` lleva `data.url = /i/<inviteId>`: el click
  del service worker abre una ruta bridge que consume la invitación y
  redirige a la ficha. No se usa `url=/academias/:id` directo porque
  saltaría el consumo (la invite quedaría pendiente).
- `POST /academies/invites/:inviteId/consume` devuelve además
  `academyId` (`{consumed, academyId}`): la página bridge no ve el
  `data` de la notificación, necesita el destino desde la respuesta.
- Nueva página bridge mínima `(app)/i/[inviteId]`: POST consume
  best-effort → `setViewMode("academy")` → `router.replace` a la
  ficha; si 404/401 → `replace("/notificaciones")`. PageLoading
  mientras resuelve.
- El tap del cuerpo del toast marca la notificación como leída
  (`POST /notifications/:id/read`, fire-and-forget) antes de navegar.
- `consumeAcademyInvites` acepta `channel` y lo emite en
  `invite.registered` (`data.channel`): `magic_link` (verify),
  `push` (tap in-app centro/toast), `device` (bridge del push de
  dispositivo). El endpoint consume lo toma del body con default
  `push`. Sin cambio de schema.

## Capabilities

### New Capabilities

(ninguna)

### Modified Capabilities

- `academies/student-invites`: el requirement "Consumo por
  notificación push" se amplía al tercer camino (push de dispositivo
  vía ruta bridge `/i/:inviteId`), el consume devuelve `academyId` y
  `invite.registered` registra `data.channel`.
- `notifications/deep-links`: el tap del toast además marca la
  notificación como leída.

## Impact

- API: `academy-invites.service.ts` (push `data.url`),
  `academy-invites.controller.ts` (response `academyId`, body
  `channel`), `common/consume-academy-invites.ts` (parámetro
  `channel` → `data` del evento), `auth.controller.ts` (pasa
  `magic_link`).
- Web: página nueva `(app)/i/[inviteId]/page.tsx`,
  `NotificationToast.tsx` (mark-read en el tap).
- Compatibilidad: el response del consume gana un campo (aditivo);
  eventos `invite.registered` previos sin `data.channel` se leen como
  canal `magic_link` (era el único camino).
- Docs: `docs/flows.md`/`architecture.md` (camino push de
  dispositivo), `qa-flows-inventory.md` (notificaciones + invite).
