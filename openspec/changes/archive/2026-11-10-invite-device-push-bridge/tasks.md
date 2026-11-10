# Tasks: invite-device-push-bridge

## 1. API

- [x] 1.1 `academy-invites.service.ts`: push `academy.invite` lleva
  `data.url = /i/<inviteId>` además de `academyId`/`inviteId`.
- [x] 1.2 `common/consume-academy-invites.ts`: args ganan
  `channel?: string`; `invite.registered` emite `data: {channel}`
  cuando viene.
- [x] 1.3 `academy-invites.controller.ts`: consume devuelve
  `{consumed, academyId}` (también en el early-return idempotente) y
  acepta body `{channel?: "push"|"device"}` (default `push`) que pasa
  al helper.
- [x] 1.4 `auth.controller.ts`: el wrapper privado pasa
  `channel: "magic_link"` en los dos call sites.

## 2. Web

- [x] 2.1 Página `(app)/i/[inviteId]/page.tsx`: consume
  `{channel:"device"}` best-effort → `setViewMode("academy")` →
  `replace` a la ficha con el `academyId` de la respuesta; error →
  `replace("/notificaciones")`; `PageLoading` mientras.
- [x] 2.2 `NotificationToast`: tap del cuerpo hace `POST
  /notifications/:id/read` fire-and-forget antes de navegar.

## 3. Tests

- [x] 3.1 `academy-invites.controller.spec`: consume devuelve
  `academyId`; idempotente también lo devuelve; channel `device` se
  propaga al evento (o al helper).
- [x] 3.2 `auth.controller.spec` (o spec del helper): el verify emite
  `invite.registered` con `data.channel = "magic_link"`.
- [x] 3.3 `academy-invites.service.spec`: la push `academy.invite`
  lleva `data.url = /i/<id>`.
- [x] 3.4 `NotificationToast.test`: el tap del cuerpo llama `POST
  /notifications/:id/read`; la X no lo llama.
- [x] 3.5 Spec de la página bridge (`i/[inviteId]/page.test.tsx`):
  consume channel=device + lente + replace a ficha; 404 y sin
  academyId → /notificaciones.
- [x] 3.6 E2E `e2e/flows/academia-invites.spec.ts`: tap in-app
  consume + lente academy + ficha (verificado en vivo).

## 4. Docs y cierre

- [x] 4.1 `docs/flows.md` + `docs/architecture.md`: tercer camino de
  consumo (push de dispositivo → bridge `/i/:inviteId`) y
  `data.channel` en `invite.registered`.
- [x] 4.2 `docs/qa-flows-inventory.md`: sección Notificaciones/invite
  con la ruta bridge y el mark-read del toast.
- [x] 4.3 `openspec validate --changes` verde; archivar al completar.
