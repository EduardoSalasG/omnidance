# admin — delta admin-catalogos-edit-page

## ADDED Requirements

### Requirement: edición de catálogo en página dedicada

La acción "Editar" de una fila de `/admin/catalogos` SHALL navegar a
`/admin/catalogos/[cat]/[id]/editar` — página con `ConsoleHeader` de
vuelta al listado, form prellenado (nombre + campo extra del catálogo),
PATCH al endpoint y regreso a `/admin/catalogos`. El listado SHALL NOT
renderizar forms de edición inline. `cat` desconocido cae a `styles`;
`id` inexistente muestra estado no-encontrado.

#### Scenario: editar un nivel

- **WHEN** el admin toca "Editar" en el nivel "Intermedio"
- **THEN** llega a `/admin/catalogos/levels/<id>/editar` con nombre y
  orden prellenados, guarda y vuelve al listado actualizado

#### Scenario: id inexistente

- **WHEN** el admin abre `/admin/catalogos/styles/no-existe/editar`
- **THEN** ve el estado "Valor no encontrado"
