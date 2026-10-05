# install-prompt-mobile

## Why

El prompt de instalación de v0.2.0 depende solo de
`beforeinstallprompt` en Android - pero el service worker solo se
registraba al activar push, así que Chrome nunca emitía el evento y el
aviso nunca aparecía en Android.

## What Changes

- `InstallPrompt` registra `/sw.js` al montar (idempotente) para que la
  PWA cumpla criterios de instalabilidad.
- `sw.js` gana un `fetch` handler vacío (requisito de Chrome) y
  `icon: /icon-192.png` en las notificaciones.
- Fallback Android sin bip: instrucciones del menú ⋮ ("Instalar app" /
  "Agregar a pantalla de inicio"), misma UX que el caso iOS.

## Capabilities

### Modified Capabilities

- `dancer-navigation`: el requisito de prompt PWA cubre Android manual.
