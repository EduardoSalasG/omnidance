# dancer-navigation - deltas

## MODIFIED Requirements

### Requirement: Prompt de instalación PWA

Con sesión activa y la app no instalada, la web SHALL mostrar un
aviso no bloqueante invitando a instalarla. La web MUST registrar el
service worker al montar el aviso (sin SW Chrome no considera la app
instalable). En Chromium con `beforeinstallprompt` MUST disparar el
diálogo nativo; en Android sin el evento e iOS debe mostrar
instrucciones manuales (menú ⋮ → Instalar app / Compartir → Agregar a
pantalla de inicio). El aviso MUST ocultarse cuando la app ya corre
instalada (display-mode standalone o navigator.standalone), en rutas
sin chrome, mientras el banner de consentimiento esté visible, y tras
un dismiss que marca `onboarding["install-prompt"]` (persistente). El
evento `appinstalled` también marca el flag.

#### Scenario: Chromium sin instalar

- **WHEN** un usuario con sesión navega la app en Chromium y el
  navegador emite `beforeinstallprompt`
- **THEN** ve el aviso con el botón "Instalar" que dispara el diálogo
  nativo del navegador

#### Scenario: Android sin evento bip

- **WHEN** un usuario con sesión navega en Android en un browser que no
  emitió `beforeinstallprompt`
- **THEN** ve el aviso con las instrucciones del menú (⋮ → Instalar
  app / Agregar a pantalla de inicio)

#### Scenario: iOS sin instalar

- **WHEN** un usuario con sesión navega en iOS sin la app instalada
- **THEN** ve el aviso con las instrucciones (Compartir → Agregar a
  pantalla de inicio)

#### Scenario: dismiss persistente

- **WHEN** el usuario cierra el aviso
- **THEN** `onboarding["install-prompt"]` queda marcado y el aviso no
  vuelve a aparecer

#### Scenario: ya instalada

- **WHEN** la app corre como standalone
- **THEN** el aviso no se muestra
