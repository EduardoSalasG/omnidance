# notification-toast-deeplink

## Why

El toast en tiempo real (`NotificationToast`) ante cualquier
notificación entrante lleva siempre a `/notificaciones`: la persona
que toca "La Casa del Mambo te invitó" llega al centro y tiene que
tocar la card otra vez para llegar a la ficha. El centro ya resuelve
el destino correcto por tipo (`hrefFor`): el toast debería usar el
mismo mapa, un tap menos para el mismo resultado.

## What Changes

- `hrefFor` se extrae de `/notificaciones/page.tsx` a
  `lib/notification-nav.ts` compartido (`notificationHref`) junto al
  efecto de tap (`notificationTapEffects`: consume + lente para
  `academy.invite`) - una sola fuente para centro y toast.
- `NotificationToast`: el cuerpo del toast navega al deep link del
  tipo (`notificationHref`); tipos sin destino caen a
  `/notificaciones` como hoy. La X sigue solo descartando.
- Sin cambio de API ni de payload: el `data` ya trae lo que cada
  deep link necesita.

## Capabilities

### New Capabilities

- `notifications/deep-links`: las superficies in-app (toast y centro)
  comparten el deep link por tipo de notificación.

### Modified Capabilities

- `academies/student-invites`: el tap del push `academy.invite`
  consume + lente también desde el toast en tiempo real, no solo
  desde la card del centro.
