# Delta: console-crud-flows (admin-campaign-detail)

## MODIFIED Requirements

### Requirement: campañas admin con crear/editar en páginas dedicadas

El listado `/admin/campanas` SHALL ofrecer la creación de campañas
solo vía un CTA que navega a `/admin/campanas/nueva`, y la edición
vía la misma página con `?edit=<id>` (precarga por
`GET /admin/mail-campaigns/:id`). MUST NOT existir un formulario de
creación o edición renderizado dentro del listado (ni permanente ni
tras toggle). Cada card del listado SHALL navegar a la ficha
`/admin/campanas/[id]` y MUST NOT contener acciones inline: las
mutaciones de operación (probar envío, correr ahora, cancelar) viven
solo en la ficha.

#### Scenario: crear campaña desde el listado

- **WHEN** el admin presiona "Nueva campaña" en `/admin/campanas`
- **THEN** navega a `/admin/campanas/nueva` con el formulario vacío y
  el back vuelve al listado

#### Scenario: abrir la ficha desde una card

- **WHEN** el admin presiona una card del listado
- **THEN** navega a `/admin/campanas/<id>` con el detalle de la
  campaña

#### Scenario: editar campaña desde una card

- **WHEN** el admin presiona una card del listado y luego la
  identidad de la campaña en su ficha (DRAFT/SCHEDULED)
- **THEN** navega a `/admin/campanas/nueva?edit=<id>` con el
  formulario precargado por `GET /admin/mail-campaigns/:id`, y al
  guardar vuelve al listado con aviso de éxito

## ADDED Requirements

### Requirement: ficha de campaña admin con historial y acciones

`/admin/campanas/[id]` SHALL mostrar la identidad de la campaña
(nombre y estado), sus datos (asunto, audiencia, programación,
próxima/última corrida, contadores acumulados), el `htmlBody` en un
preview aislado (iframe sandbox), el historial de corridas
(`GET /admin/mail-campaigns/:id/runs`, más nuevas primero, con
trigger, estado, fechas, destinatarios y enviados/fallidos) y las
acciones de operación: probar envío (`POST :id/test`), enviar ahora
(`POST :id/run` con confirmación) y cancelar (`POST :id/cancel` con
confirmación, visible solo si el estado lo permite). Toda acción
MUST emitir `ActionNotice` con su resultado y refrescar la ficha. La
edición solo se ofrece cuando la campaña es DRAFT o SCHEDULED. Una
campaña inexistente o sin permiso MUST renderizar un estado
explícito ("no encontrada" / "sin acceso"), nunca una página en
blanco.

#### Scenario: historial de corridas

- **WHEN** el admin abre la ficha de una campaña con corridas
- **THEN** ve la lista de runs más nuevos primero con trigger
  (CRON/MANUAL), estado (RUNNING/OK/ERROR/CANCELLED), fecha de
  inicio, destinatarios y contadores sent/fail; una campaña sin
  corridas muestra estado vacío

#### Scenario: acciones de operación con confirmación

- **WHEN** el admin presiona "Enviar ahora" o "Cancelar" en la ficha
- **THEN** un `ConfirmSheet` pide confirmación antes de disparar el
  POST, y el resultado se comunica por `ActionNotice` (el botón
  "Prueba" no requiere confirmación)

#### Scenario: campaña inexistente

- **WHEN** el admin abre `/admin/campanas/<id>` de una campaña que no
  existe
- **THEN** ve un estado "no encontrada" con salida al listado, sin
  error de red visible
