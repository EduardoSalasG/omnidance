# Design: invite-device-push-bridge

## Decisiones (ya aprobadas por el owner)

1. **Ruta bridge `/i/:inviteId` en vez de `data.url=/academias/:id`**:
   el click del push debe consumir la invitación; una url directa a la
   ficha dejaría la invite pendiente y perdería el Referral/evento. La
   bridge es una página client mínima dentro de `(app)` (hereda el
   chrome y los providers de sesión).
2. **`academyId` en la respuesta del consume**: la bridge solo conoce
   `inviteId` (lo que viaja en `data.url`); la ficha destino la
   devuelve el endpoint. Aditivo, no breaking.
3. **Canal por parámetro, sin schema**: `invite.registered` ya lleva
   `data` libre (ActivityEvent). `consumeAcademyInvites` gana
   `channel` en sus args y lo pone en `data.channel`. El endpoint lo
   lee del body con una validación cerrada (`push`|`device`, default
   `push`); el verify pasa `magic_link` fijo. Retrocompat: eventos sin
   `channel` = `magic_link`.
4. **Mark-read del toast fire-and-forget**: la lectura es UX
   secundaria; un fallo no debe bloquear la navegación (el centro la
   marcará al entrar, que hoy hace `read-all` al cargar).

## Cambios por archivo

### API

- `academies/infrastructure/academy-invites.service.ts`: el
  `notifySafe` de `academy.invite` agrega `url: /i/${invite.id}` a
  `data` (el SW ya consume `data.url` tal cual; sirve de patrón para
  futuros tipos con deep link propio).
- `academies/infrastructure/academy-invites.controller.ts`: el consume
  devuelve `{consumed, academyId}` (incluido en el early-return
  idempotente); nuevo DTO de body `{channel?: "push"|"device"}`
  (class-validator `IsIn`+`IsOptional`) que se pasa al helper; default
  `push`.
- `common/consume-academy-invites.ts`: args ganan `channel?: string`;
  `emitActivity(invite.registered)` lleva `data: {channel}` solo si
  viene (los callers de verify lo pasan siempre).
- `auth/infrastructure/auth.controller.ts`: el wrapper privado pasa
  `channel: "magic_link"` en ambos call sites (verify magic link y
  otp verify).

### Web

- `app/[locale]/(app)/i/[inviteId]/page.tsx` (nuevo, client): lee
  `inviteId` de params; en effect único: `apiFetch POST
  /academies/invites/:id/consume {channel:"device"}` → si ok,
  `setViewMode("academy")` + `router.replace(/academias/<academyId>)`
  (academyId del body; si no viniera, cae a /notificaciones); si
  !ok/throw → `replace("/notificaciones")`. Renderiza `PageLoading`.
- `components/realtime/NotificationToast.tsx`: en el onClick del
  cuerpo, `apiFetch POST /notifications/:id/read` en
  fire-and-forget `.catch(() => {})` junto a `notificationTapEffects`.

## Riesgos

- `data.url` también llega al toast/centro vía `data` de la
  notificación in-app: `notificationHref` resuelve `academy.invite`
  antes del fallback `data.path` (y `url` no es `path`), sin
  colisión.
- Persona sin sesión que abre `/i/:id` desde el push: `(app)` no
  redirige a login por sí solo; la bridge responde 401 →
  `/notificaciones`, que muestra el estado `unauth` con CTA de login.
  Aceptable: el correo con magic link sigue siendo el camino de
  entrada sin sesión.
- `inviteId` en la URL es opaco (cuid) y el endpoint valida email del
  llamante: no oráculo de invitaciones (404 indistinguible).

## Verificación

- Specs vitest del controller (academyId en respuesta, channel
  device/push/default, 404), del helper (data.channel en el evento) y
  del toast (POST /read en el tap).
- Typecheck api+web, eslint de archivos tocados.
- Smoke vivo opcional: push real no se puede emitir sin dispositivo;
  la bridge se prueba por URL directa con invite real.
