## MODIFIED Requirements

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
