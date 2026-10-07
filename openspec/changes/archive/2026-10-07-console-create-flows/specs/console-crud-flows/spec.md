## Purpose

Flujos de creación y edición de entidades dentro de las consolas B2B
(ACADEMY_OWNER, INSTRUCTOR, PRODUCER, STAFF): la gestión de entidades se
inicia desde un CTA explícito que abre una página dedicada, en vez de
formularios siempre visibles dentro de los listados.

## ADDED Requirements

### Requirement: Creación detrás de un CTA

Las páginas de listado de las consolas SHALL presentar un botón visible
"＋ Crear <entidad>" como único punto de entrada a la creación de la entidad
que administran. MUST NOT existir un formulario de creación o edición
renderizado permanentemente dentro de una página de listado. La acción de
crear MUST navegar a una página dedicada del formulario.

#### Scenario: Entrada a la creación desde la lista

- **WHEN** un usuario con acceso a la consola abre una página de listado
  gestionable (planes, videos, alumnos, equipo, series, eventos, códigos,
  listas)
- **THEN** ve el listado y un botón "＋ Crear"
- **AND** no hay formulario de creación visible en esa página

#### Scenario: Formulario en página dedicada

- **WHEN** el usuario presiona "＋ Crear"
- **THEN** navega a la página dedicada del formulario (`…/nueva` o `…/nuevo`)
- **AND** al confirmar con éxito vuelve a la lista o al detalle con un aviso
  de estado accesible (`role="status"` o `aria-live`)

### Requirement: Edición en la misma página de formulario

La edición de una entidad SHALL usar la misma página dedicada del formulario
que la creación, precargada con los datos existentes (vía `?edit=<id>` o
ruta equivalente). Las acciones "Editar" por fila/card MUST navegar a esa
página en modo edición en vez de expandir un formulario inline.

#### Scenario: Editar desde la lista

- **WHEN** el usuario presiona "Editar" sobre una entidad de la lista
- **THEN** navega a la página de formulario en modo edición con los datos
  precargados
- **AND** al guardar vuelve a la lista con la entidad actualizada y feedback

### Requirement: Estado vacío con CTA

El estado vacío de un listado gestionable SHALL ofrecer el CTA de creación
como acción principal, en lugar de un mensaje sin salida.

#### Scenario: Lista vacía

- **WHEN** el listado no tiene entidades
- **THEN** el empty state muestra el mensaje y el botón de crear como acción
  principal

### Requirement: Excepciones inline permitidas

Los siguientes formularios SHALL permanecer inline por ser la acción
primaria de su pantalla, settings, o acciones por fila — no creación de
entidad desde un listado:

- Registro rápido de asistencia (`/academia/asistencia`) y alta manual en la
  consola de puerta (`/staff/[eventId]`).
- Formularios de configuración: quórum y perfil público de la academia,
  parámetros del productor, métodos de pago.
- Acciones por fila: reagendar/asignar clases particulares, aprobar o
  rechazar comprobantes, agregar persona a una lista existente, toggles de
  capacidades del equipo.
- Creación de academia en el gate (solo visible cuando la persona no tiene
  academia).

#### Scenario: Registro rápido de asistencia sigue inline

- **WHEN** un staff/instructor abre `/academia/asistencia`
- **THEN** el formulario "marcar presente" sigue visible como acción
  primaria de la pantalla
