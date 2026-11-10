# console-crud-flows Specification

## Purpose
Flujos de creación y edición de entidades dentro de las consolas B2B
(ACADEMY_OWNER, INSTRUCTOR, PRODUCER, STAFF): la gestión de entidades se
inicia desde un CTA explícito que abre una página dedicada, en vez de
formularios siempre visibles dentro de los listados.

## Requirements

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

En un listado gestionable SHALL existir exactamente un CTA de crear:
el del header de la pantalla o de la sección que lista la entidad. El
estado vacío SHALL mostrar solo el mensaje (sin repetir el botón de
crear en ninguna variante), salvo cuando la superficie no tiene CTA
de crear propio (ej. el dashboard del productor sin actividad, donde
el CTA de primer evento es la acción del estado vacío).

#### Scenario: Lista vacía

- **WHEN** el listado no tiene entidades y el header de la pantalla o
  de la sección ya muestra el botón de crear
- **THEN** el empty state muestra el mensaje y NO repite el botón de
  crear

#### Scenario: preventa por academias vacía en la ficha del evento

- **GIVEN** un evento del productor sin acuerdos de preventa
- **WHEN** el productor abre su ficha
- **THEN** la sección "Preventa por academias" muestra el mensaje
  vacío y el único CTA `＋ Invitar` es el del header de la sección

#### Scenario: medios de cobro vacíos

- **GIVEN** un productor sin métodos propios ni pasarela
- **WHEN** abre `/productor/medios-pago`
- **THEN** el empty state muestra el mensaje y el único CTA "Agregar
  método" es el del header de la card

#### Scenario: dashboard sin actividad

- **GIVEN** un productor aprobado sin eventos
- **WHEN** abre `/inicio` en su lente
- **THEN** el dashboard muestra el CTA de crear su primer evento (la
  superficie no tiene CTA de crear propio)

### Requirement: Excepciones inline permitidas

Los siguientes formularios SHALL permanecer inline por ser la acción
primaria de su pantalla, settings, o acciones por fila; no creación de
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

### Requirement: Toda mutación visible al usuario emite feedback perceptible

Toda acción del usuario SHALL comunicar su resultado con `ActionNotice`
(estándar único de feedback post-acción, todos los perfiles). El aviso
SHALL sobrevivir a la navegación inmediata: un flujo que navega tras
mutar (crear → listado) MUST emitir el aviso vía el host global para que
se muestre en el destino.

Un cambio de estado implícito (badge, fila que desaparece, redirect sin
aviso) SHALL NOT ser el único feedback. Fallos SHALL producir feedback
de error perceptible (`role="alert"`), nunca silencio. Excepciones
permitidas: switch optimista reversible, pantalla terminal (pago,
encuesta entregada), banner de retorno de pasarela por query param,
feedback in-situ bajo la regla de ~5s (scanner en pista), ConfirmSheet
como paso previo.

#### Scenario: reserva de clase desde la lista scrolleado abajo

- **WHEN** el usuario reserva una clase desde `/clases` estando en la
  parte baja de la lista
- **THEN** ve la confirmación de éxito sin scrollear (ActionNotice fijo)

#### Scenario: aprobar comprobante de cobro

- **WHEN** productor/admin aprueba un claim/comprobante
- **THEN** hay confirmación previa (ConfirmSheet) o el feedback de éxito
  es explícito antes de la navegación

#### Scenario: acción de dinero falla

- **WHEN** approve/pay/generate del admin o métodos de pago del
  productor fallan (no-ok o error de red)
- **THEN** el usuario ve un error perceptible con role="alert"

#### Scenario: crear entidad desde form dedicado

- **GIVEN** el usuario guarda en `/nuevo` y el flujo redirige al listado
- **WHEN** la mutación responde OK
- **THEN** el aviso de éxito se muestra en el listado destino (host
  global), sin pantalla intermedia ni timer artificial

#### Scenario: mutación silenciosa gana aviso

- **GIVEN** una acción cuyo único resultado visible era la fila que
  desaparecía o un reload
- **WHEN** el usuario la ejecuta
- **THEN** `ActionNotice` confirma el éxito o muestra el error;
  respuestas no-ok se reportan (no se ignoran)

#### Scenario: inline persistente migra a aviso flotante

- **GIVEN** una página que mostraba `<p role="status">` permanente tras
  guardar
- **WHEN** el usuario muta
- **THEN** el resultado sale por `ActionNotice` con auto-dismiss

### Requirement: campañas admin con crear/editar en páginas dedicadas

El listado `/admin/campanas` SHALL ofrecer la creación de campañas
solo vía un CTA que navega a `/admin/campanas/nueva`, y la edición
vía la misma página con `?edit=<id>` (precarga por
`GET /admin/mail-campaigns/:id`). MUST NOT existir un formulario de
creación o edición renderizado dentro del listado (ni permanente ni
tras toggle). Las acciones de operación por card (probar envío,
correr ahora, cancelar) permanecen en el listado.

#### Scenario: crear campaña desde el listado

- **WHEN** el admin presiona "Nueva campaña" en `/admin/campanas`
- **THEN** navega a `/admin/campanas/nueva` con el formulario vacío y
  el back vuelve al listado

#### Scenario: editar campaña desde una card

- **WHEN** el admin presiona "Editar" en una card del listado
- **THEN** navega a `/admin/campanas/nueva?edit=<id>` con el
  formulario precargado por `GET /admin/mail-campaigns/:id`, y al
  guardar vuelve al listado con aviso de éxito
