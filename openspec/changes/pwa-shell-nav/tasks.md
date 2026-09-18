# pwa-shell-nav — tareas

## 1. Landing fuera del shell (route groups)

- [x] `(marketing)` group: `/` (landing) y `/login` sin BottomNav
- [x] `(app)` group: resto de rutas con BottomNav + RealtimeProvider + skip-link
- [x] `/inicio` → HomeHub; `/` con sesión → redirect server a `/inicio`
- [x] Referencias "home" de la app apuntan a `/inicio` (BottomNav, CTAs, sw.js fallback)
- [ ] Verificación: typecheck + build + smoke de `/`, `/inicio`, `/login`

## 2. BottomNav 5 tabs + "Más" role-gated

- [x] Tabs: Inicio, Eventos, Escanear (centro), Alertas (badge), Más
- [x] Hoja "Más": dialog accesible (focus trap/restore, Escape, overlay, slide-up, reduced-motion)
- [x] Items filtrados por `me.roles` (consumidor base + staff/productor/academia/admin según rol)
- [x] Claves i18n nav.* nuevas
- [ ] Verificación: typecheck + revisión de gating por rol

## 3. Fix push iOS

- [x] Reusar suscripción existente (`getSubscription`) antes de subscribe
- [x] Retry de `subscribe()` (AbortError transitorio de Apple Push)
- [x] `console.error` del error real + detalle visible bajo el mensaje
- [ ] Confirmar en el iPhone del usuario qué error específico salía (el detalle ahora se muestra)

## 4. Landing three.js

- [ ] Escena minimalista (dynamic ssr:false, reduced-motion estático, DPR cap, dispose)
- [ ] Restyle conversion-first (1 promesa, 1 CTA, aire)
- [ ] three agregado a apps/web (versión estable >7 días)
- [ ] Verificación: typecheck + smoke visual

## 5. Cierre

- [ ] tsc limpio web · build verde · smoke páginas clave
- [ ] Commit(s) por scope
