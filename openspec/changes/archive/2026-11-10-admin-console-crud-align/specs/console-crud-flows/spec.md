# Delta: console-crud-flows (admin-console-crud-align)

## ADDED Requirements

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
