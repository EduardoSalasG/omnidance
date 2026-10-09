# Delta: academies/console-lists

## ADDED Requirements

### Requirement: Flujo crear → detalle → editar en consolas

Las consolas por rol (dueño de academia, productor, admin) DEBEN (SHALL) seguir
el mismo flujo de navegación: el alta de una entidad se inicia desde un
botón de acción en el listado que abre una página dedicada de creación;
cada card o fila del listado es completamente navegable al detalle del
elemento; el detalle expone los datos, la edición y las acciones
relevantes; la edición vive en una página o modo propio detrás de un
CTA "Editar" en el detalle.

#### Scenario: crear desde el listado

- WHEN el usuario con capacidad de escritura ve un listado de consola
- THEN existe un CTA primario "Nuevo/Crear" que navega a una página
  dedicada de creación (no un form inline en el listado)

#### Scenario: card navegable

- WHEN el usuario activa un card o fila del listado (click o Enter)
- THEN la app navega a la página de detalle del elemento completo

#### Scenario: detalle accionable

- WHEN el usuario abre el detalle de un elemento
- THEN ve sus datos, un CTA de edición y las acciones disponibles para
  su rol sobre ese elemento

### Requirement: Acciones destructivas en zona dedicada

Toda acción destructiva o de baja (eliminar, quitar del equipo, baja de
medio de pago) DEBE (SHALL) vivir en la página de detalle del elemento, en una
zona al pie centrada y con color destructivo (rojo), nunca como control
inline del listado ni dentro del action row de acciones comunes.

#### Scenario: eliminar desde el detalle

- WHEN el usuario con permiso abre el detalle y presiona la acción
  destructiva al pie de la página
- THEN se le pide confirmación y la acción se ejecuta con feedback

#### Scenario: listado sin controles destructivos

- WHEN el usuario ve un listado de consola
- THEN ningún card muestra controles destructivos inline; el card
  completo navega al detalle

### Requirement: Estados y accesibilidad de consola

Las páginas de consola DEBEN (SHALL) cumplir el estándar de carga y
accesibilidad: skeleton del layout conocido durante la carga (nunca
`<Spinner>` desnudo de panel), estado vacío con próximo paso cuando
aplica, error con retry, `role="alert"` en errores, `role="status"` en
feedback exitoso, h1 único provisto por el chrome, back link
predecible al padre en subpáginas, y foco visible + touch targets
≥44px en todo control.

#### Scenario: error con retry

- WHEN un fetch de consola falla
- THEN la página muestra el error con `role="alert"` y un botón
  "Reintentar" que relanza la carga

#### Scenario: carga con skeleton

- WHEN una página o sección de consola está cargando datos
- THEN muestra un skeleton que anticipa la estructura, nunca un
  spinner desnudo ni texto "Cargando…"

#### Scenario: h1 único

- WHEN una página de consola renderiza
- THEN existe exactamente un `h1` - el provisto por el chrome del
  appbar; las páginas no declaran `h1` propios (los títulos de sección
  son `h2`/`h3`)
