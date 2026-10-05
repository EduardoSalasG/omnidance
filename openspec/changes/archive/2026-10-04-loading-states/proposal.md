# Proposal: loading-states — cero flash de contenido

## Problema

En `/perfil` (y páginas con el mismo patrón) el usuario ve contenido
"real" por milisegundos que luego desaparece o se reemplaza: secciones
que renderizan defaults (`streak ?? 0`), empty-states mostrados mientras
el fetch sigue en vuelo ("aún no tienes insignias" → aparecen badges),
secciones que pop-in/out por fetches escalonados, y páginas sin gate de
carga cuyo SSR/hydration pinta la lente por defecto (social/DANCER) y
luego cambia a la lente guardada en localStorage.

## Alcance

- Auditoría + fix transversal de las 65 páginas de `(app)` y los
  componentes que fetchean (`apiFetch` + `useState` + `useEffect`).
- Estándar de carga: nada de contenido real ni empty-state antes de que
  el primer fetch resuelva → skeleton con layout conocido (listas/cards/
  detalle) o `PageLoading` (gates de sesión/rol, forma desconocida).
- Secciones secundarias: skeleton o `null` hasta tener data — nunca
  valores por defecto ni empty-state prematuro.
- Mantener el estándar de carga percibida existente (beacon 200ms delay,
  `.page-loading`, `NavPendingOverlay`) — los cambios lo usan, no lo
  reescriben.
- Sin empeorar UX: donde ya hay skeleton correcto, no tocar.

## Fuera de alcance

- Cambiar el modelo de data-fetching (no SWR/React Query).
- SSR de datos reales (las páginas autenticadas cargan por cookie en
  cliente — el SSR solo pinta el estado de carga, que debe ser el mismo
  en server y cliente).
- Optimización de latencia de API.

## Criterio de aceptación

- En `/perfil` no se ve `0` ni empty-state de insignias mientras cargan
  gamificación/stats.
- Ninguna página muestra empty-state ni contenido default antes del
  primer resolve de su fetch inicial.
- Ninguna sección dependiente de `localStorage` (lente/modo) pinta una
  variante distinta entre SSR y primer render cliente.
- `tsc` limpio, i18n `ALL_KEYS_OK`, `impeccable detect` sin hallazgos en
  el diff.
