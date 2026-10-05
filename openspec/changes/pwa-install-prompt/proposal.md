# pwa-install-prompt

## Why

El magic link y la app web ya viven en el mismo origen, así que una
PWA instalada captura los links de sesión en Android. Pero nadie le
dice al usuario que instale la app - sin el aviso, la mayoría nunca
usa "Agregar a pantalla de inicio" y el magic link siempre abre el
browser.

## What Changes

- Nuevo `InstallPrompt` en el chrome de `(app)`: visible tras login
  cuando hay sesión y la app no está instalada.
  - Chromium: captura `beforeinstallprompt` y dispara el prompt
    nativo con el botón "Instalar".
  - iOS (no-standalone): instrucciones del share sheet
    (Compartir → Agregar a pantalla de inicio).
- Se oculta: si ya corre instalada (display-mode standalone /
  navigator.standalone), en contextos sin chrome (staff puerta), y
  mientras el banner de consentimiento ocupa el slot.
- Dismiss persistente vía `onboarding["install-prompt"]`
  (`POST /me/onboarding`); `appinstalled` también la marca.
- `manifest.json` declara `id`/`scope`/`handle_links: "preferred"`
  para que el sistema prefiera la PWA instalada al abrir links del
  dominio.

## Capabilities

### Modified Capabilities

- `dancer-navigation`: prompt de instalación PWA post-login con
  dismiss persistente.

## Impact

- **Web**: `components/install/InstallPrompt.tsx`, mount en
  `(app)/layout.tsx`, part i18n `install.json`, manifest.
- Sin cambios de API ni schema - el flag vive en `Person.onboarding`.
