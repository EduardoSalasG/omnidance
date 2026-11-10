# notification-toast-deeplink - diseño

## Context

`hrefFor` vive como función privada en
`notificaciones/page.tsx` y mapea `type` + `data` al path destino
(eventos, clases, ficha de academia, etc.). El toast
(`components/realtime/NotificationToast.tsx`) envuelve título+cuerpo
en un `<Link href="/notificaciones">` para todos los tipos. El
side-effect de `academy.invite` (consume + `setViewMode`) está
inline en `markRead` de la página.

## Goals / Non-Goals

**Goals:** un solo mapa tipo → destino; el toast navega al contexto
real; los side-effects por tipo corren desde ambas superficies.

**Non-Goals:** no reordenar el mapa ni agregar destinos nuevos a
tipos que hoy caen al fallback `data.path`/`null`; no tocar la X ni
el auto-dismiss; no cambiar payloads de API.

## Decisions

- **`lib/notification-nav.ts`**: `notificationHref(n)` (el `hrefFor`
  movido tal cual, aceptando `{ type, data?: unknown }` y
  estrechando campos por typeof - cubre `NotificationItem` del
  centro y `RealtimeNotification` del socket) y
  `notificationTapEffects(n)` (hoy solo `academy.invite`: consume
  fire-and-forget + `setViewMode("academy")`). La página deja de
  tener la tabla y el efecto inline.
- **Toast**: el `<Link>` del cuerpo pasa a `<button>`: `dismiss()`
  + `notificationTapEffects(shown)` +
  `router.push(notificationHref(shown) ?? "/notificaciones")`.
  `useRouter` de `@/i18n/navigation` (mismo router con locale que la
  página).
- El fallback `/notificaciones` preserva el comportamiento actual
  para tipos sin destino y para el caso `data` incompleto.

## Risks / Trade-offs

- Tipos con `data` incompleto en el socket caen al centro en vez de
  un destino roto: mismo fallback que la card.
- El toast marca navegación sin marcar leída en el servidor (la card
  sí): queda como no-leída hasta abrir el centro, consistente con el
  modelo "leer al entrar al centro".
