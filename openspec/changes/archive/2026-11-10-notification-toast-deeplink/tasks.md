# Tasks: notification-toast-deeplink

## 1. Fuente compartida

- [x] 1.1 Crear `apps/web/src/lib/notification-nav.ts` con
  `notificationHref(n)` (el `hrefFor` movido, aceptando `data`
  `unknown` con narrowing) y `notificationTapEffects(n)`
  (`academy.invite`: consume POST fire-and-forget +
  `setViewMode("academy")`).
- [x] 1.2 `notificaciones/page.tsx` usa los helpers compartidos
  (borra `hrefFor` local y el bloque inline de academy.invite).

## 2. Toast deep-link

- [x] 2.1 `NotificationToast`: cuerpo `<Link>` → `<button>` que
  dismiss + tapEffects + `router.push(href ?? "/notificaciones")`.
- [x] 2.2 Spec del toast: tap con tipo con deep link → push al
  destino; tipo sin destino → push a `/notificaciones`;
  `academy.invite` → consume + viewMode + ficha.

## 3. Verificación

- [x] 3.1 Specs web (notificaciones page + toast) en verde +
  typecheck web.
- [x] 3.2 `docs/qa-flows-inventory.md` y `flows.md` actualizados si
  el comportamiento descrito quedó distinto.
