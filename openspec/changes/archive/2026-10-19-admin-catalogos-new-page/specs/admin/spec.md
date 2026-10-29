# admin; delta admin-catalogos-new-page

## ADDED Requirements

### Requirement: mantenedor de catálogos legible en móvil

Las secciones de `/admin/catalogos` SHALL listar sus valores como filas
de lectura (nombre truncable a la izquierda; metadatos y acciones
agrupados en la zona derecha); no cards de contenido variable. El alta
de un valor SHALL hacerse en una página dedicada
`/admin/catalogos/nuevo?cat=<catalogo>` alcanzada por un CTA por
sección; nunca un form inline en el listado.

#### Scenario: fila legible en 320px

- **WHEN** el admin ve "Niveles de clase" en un teléfono de 320px
- **THEN** cada fila muestra el nombre (truncado si hace falta), su
  orden y los botones Editar/Eliminar sin desbordar

#### Scenario: alta por sección

- **WHEN** el admin toca "＋ Nuevo" en "Estilos de baile"
- **THEN** llega a `/admin/catalogos/nuevo?cat=styles`, ve el campo
  género, crea el valor y vuelve al listado que lo muestra

#### Scenario: cat inválido o ausente

- **WHEN** el admin abre `/admin/catalogos/nuevo` sin `cat` o con un
  valor desconocido
- **THEN** el form corresponde a la primera sección (estilos)
