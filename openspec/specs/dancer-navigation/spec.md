# dancer-navigation Specification

## Purpose
Navegación del rol DANCER: bottom bar de 5 ítems con botón central `+` que abre un sheet de acciones (Mi QR destacado + módulos secundarios), reemplazando el drawer lateral para este rol.

## Requirements

### Requirement: Bottom bar del bailarín

En viewports `<lg` el bottom bar del rol DANCER SHALL tener exactamente 5
ítems: Inicio (`/inicio`), Eventos (`/eventos`), botón central `+`, Amigos
(`/amigos`) y Perfil (`/perfil`). El botón `+` MUST NOT navegar - abre el
sheet de acciones. Los ítems MUST tener touch targets ≥44px y
`aria-current` en la ruta activa. En viewports `≥lg` el bottom bar MUST NOT
renderizarse; la navegación del bailarín la provee la sidebar de la app
(destinos por lente, ver `responsive-app-shell`).

#### Scenario: Bailarín ve sus tabs

- WHEN un usuario con rol activo DANCER está autenticado en un viewport
  `<lg`
- THEN el bottom bar muestra Inicio, Eventos, `+` central, Amigos y Perfil
- AND no se muestra el ítem Entradas

#### Scenario: Botón central abre el sheet

- WHEN el bailarín toca el botón `+` del bottom bar en un viewport `<lg`
- THEN se abre un sheet sobre el contenido con el QR personal destacado y
  accesos a Bailes y Prácticas
- AND el botón `+` no produce navegación

#### Scenario: Bailarín en desktop

- WHEN un usuario con rol activo DANCER navega en un viewport `≥lg`
- THEN no existe bottom bar ni botón `+` central
- AND la sidebar muestra los destinos de la lente activa (Social o
  Academia)

### Requirement: Sheet de acciones del bailarín

El sheet MUST presentar el QR personal como elemento destacado (el más grande/primero) y los accesos secundarios alrededor. MUST cerrarse con backdrop, tecla Escape y al navegar. MUST respetar `prefers-reduced-motion`. MUST ser accesible: focus atrapado mientras está abierto y `aria-modal`/`role="dialog"`.

#### Scenario: Acceso al QR desde el sheet

- WHEN el sheet está abierto
- THEN el QR personal del usuario se muestra destacado y los accesos Bailes/Prácticas navegan a su ruta

#### Scenario: Cierre del sheet

- WHEN el sheet está abierto y el usuario toca el backdrop, presiona Escape o navega
- THEN el sheet se cierra y devuelve el foco al botón `+`

### Requirement: Drawer lateral no aplica al bailarín

En viewports `<lg`, para el rol DANCER MUST NOT renderizarse el drawer
lateral ni la hamburguesa del appbar. Los roles con consola (PRODUCER,
ADMIN, STAFF, ACADEMY_OWNER, INSTRUCTOR, DJ, VENUE_MANAGER, SUPPORT)
conservan su drawer actual en `<lg`. En `≥lg` ningún rol usa el drawer
overlay ni el sheet del bailarín - la sidebar persistente cubre la
navegación para todos los roles, incluido DANCER.

#### Scenario: Dancer sin drawer

- WHEN el rol activo es DANCER en un viewport `<lg`
- THEN el appbar no muestra hamburguesa y no existe drawer lateral para ese
  rol

#### Scenario: Otros roles conservan drawer

- WHEN el rol activo es PRODUCER (u otro con consola) en un viewport `<lg`
- THEN el drawer lateral sigue disponible con sus módulos

### Requirement: Entradas fuera del nav del bailarín

La ruta `/entradas` MUST dejar de estar en el bottom bar, el sheet y el drawer del DANCER. La agenda de tickets se cubre con `/eventos?view=mios`. La página `/entradas` MUST eliminarse o redirigir a `/eventos?view=mios`.

#### Scenario: Sin ruta entradas en la IA del dancer

- WHEN un bailarín navega por bottom bar, sheet o drawer
- THEN ningún destino apunta a `/entradas`

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
