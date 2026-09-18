# pwa-shell-nav — landing separada, tab bar de 5 + "Más" role-gated

Separación marketing/app, navegación de 5 tabs con hoja "Más" por rol,
fix de Web Push en iOS y landing con escena three.js.

## Alcance

1. **Landing fuera del shell** — route groups: `(marketing)` (/, /login,
   sin BottomNav) y `(app)` (todo lo demás, con BottomNav). Home autenticado
   pasa a `/inicio`; `/` redirige a `/inicio` si hay sesión.
2. **BottomNav 5 tabs** — Inicio, Eventos, Escanear (centro), Alertas
   (badge), Más → bottom-sheet con el resto de módulos, filtrados por
   `me.roles` (STAFF→consola staff, PRODUCER→/productor,
   ACADEMY_OWNER/INSTRUCTOR→/academia, ADMIN→/admin+/crm; consumidor→
   bailes/entradas/QR/prácticas/viajes/perfil).
3. **Fix push iOS** — reusar suscripción existente (getSubscription),
   retry de subscribe, logging del error real, mensaje con detalle.
4. **Landing three.js** — hero con escena mínima (partículas/onda, dark+
   neon), dynamic import ssr:false, reduced-motion → frame estático,
   DPR cap, cleanup. Conversión: 1 promesa + 1 CTA.

## Fuera de scope

- Cambios de backend (roles ya vienen de /me).
- iOS <16.4 sin Web Push (limitación de plataforma, se detecta y se avisa).
