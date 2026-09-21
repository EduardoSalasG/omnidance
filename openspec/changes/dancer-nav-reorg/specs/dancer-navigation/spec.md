# dancer-navigation

## Purpose

Navegación del rol DANCER: bottom bar de 5 ítems con botón central `+` que abre un sheet de acciones (Mi QR destacado + módulos secundarios), reemplazando el drawer lateral para este rol.

## ADDED Requirements

### Requirement: Bottom bar del bailarín

El bottom bar del rol DANCER SHALL tener exactamente 5 ítems: Inicio (`/inicio`), Eventos (`/eventos`), botón central `+`, Amigos (`/amigos`) y Perfil (`/perfil`). El botón `+` MUST NOT navegar — abre el sheet de acciones. Los ítems MUST tener touch targets ≥44px y `aria-current` en la ruta activa.

#### Scenario: Bailarín ve sus tabs

- WHEN un usuario con rol activo DANCER está autenticado
- THEN el bottom bar muestra Inicio, Eventos, `+` central, Amigos y Perfil
- AND no se muestra el ítem Entradas

#### Scenario: Botón central abre el sheet

- WHEN el bailarín toca el botón `+` del bottom bar
- THEN se abre un sheet sobre el contenido con el QR personal destacado y accesos a Bailes, Prácticas, Viajes y Notificaciones
- AND el botón `+` no produce navegación

### Requirement: Sheet de acciones del bailarín

El sheet MUST presentar el QR personal como elemento destacado (el más grande/primero) y los accesos secundarios alrededor. MUST cerrarse con backdrop, tecla Escape y al navegar. MUST respetar `prefers-reduced-motion`. MUST ser accesible: focus atrapado mientras está abierto y `aria-modal`/`role="dialog"`.

#### Scenario: Acceso al QR desde el sheet

- WHEN el sheet está abierto
- THEN el QR personal del usuario se muestra destacado y los accesos Bailes/Prácticas/Viajes/Notificaciones navegan a su ruta

#### Scenario: Cierre del sheet

- WHEN el sheet está abierto y el usuario toca el backdrop, presiona Escape o navega
- THEN el sheet se cierra y devuelve el foco al botón `+`

### Requirement: Drawer lateral no aplica al bailarín

Para el rol DANCER MUST NOT renderizarse el drawer lateral ni la hamburguesa del appbar. Los roles con consola (PRODUCER, ADMIN, STAFF, ACADEMY_OWNER, INSTRUCTOR, DJ, VENUE_MANAGER, SUPPORT) conservan su drawer actual.

#### Scenario: Dancer sin drawer

- WHEN el rol activo es DANCER
- THEN el appbar no muestra hamburguesa y no existe drawer lateral para ese rol

#### Scenario: Otros roles conservan drawer

- WHEN el rol activo es PRODUCER (u otro con consola)
- THEN el drawer lateral sigue disponible con sus módulos

### Requirement: Entradas fuera del nav del bailarín

La ruta `/entradas` MUST dejar de estar en el bottom bar, el sheet y el drawer del DANCER. La agenda de tickets se cubre con `/eventos?view=mios`. La página `/entradas` MUST eliminarse o redirigir a `/eventos?view=mios`.

#### Scenario: Sin ruta entradas en la IA del dancer

- WHEN un bailarín navega por bottom bar, sheet o drawer
- THEN ningún destino apunta a `/entradas`

## REMOVED Requirements

### Requirement: QR como tab central del bottom bar

**Reason**: el QR pasa al sheet del botón `+`, que lo muestra destacado sin ocupar un slot de navegación.
**Migration**: quien usaba el tab QR ahora lo obtiene con un toque en `+`.

### Requirement: Drawer lateral para DANCER

**Reason**: 4 destinos secundarios no justifican un drawer completo; el sheet los cubre con menos chrome.
**Migration**: Bailes, Prácticas, Viajes y Notificaciones viven en el sheet del `+`.
