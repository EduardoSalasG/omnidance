# admin — delta admin-usuarios-refine

## ADDED Requirements

### Requirement: listas de actividad por rol con expand tras 5

En la ficha `/admin/usuarios/[personId]`, cada lista dentro de las
cards de "Actividad por rol" SHALL mostrar máximo 5 filas por defecto;
cuando la lista supera las 5, un toggle centrado SHALL permitir ver
todas ("Ver las {count}") y volver a colapsar ("Ver menos") — mismo
patrón que las fichas de `/admin/academias/[id]`.

#### Scenario: lista larga colapsada

- **WHEN** un productor tiene 14 eventos pasados
- **THEN** la lista "Eventos pasados" muestra 5 filas y el toggle
  "Ver las 14"

#### Scenario: expansión y colapso

- **WHEN** el admin toca "Ver las 14" y luego "Ver menos"
- **THEN** la lista muestra todas las filas y vuelve a 5
  respectivamente

#### Scenario: lista corta sin toggle

- **WHEN** la lista tiene ≤5 filas
- **THEN** no se renderiza toggle

### Requirement: contadores de actor en el listado de usuarios

Cada item de `GET /admin/users` SHALL incluir `academiesCount`
(cantidad de `Academy` con `ownerId` = la persona) y `eventsCount`
(cantidad de `Event` con `producerId` = la persona). El card del
listado SHALL mostrar "N academia(s)" y/o "N evento(s)" únicamente
cuando el contador es mayor a cero.

#### Scenario: owner multi-academia

- **WHEN** un usuario es dueño de 3 academias
- **THEN** su card muestra "3 academias"

#### Scenario: bailarín sin producción

- **WHEN** un usuario tiene 0 academias y 0 eventos creados
- **THEN** su card no muestra línea de contadores

#### Scenario: sin N+1

- **WHEN** la página trae 25 personas
- **THEN** los contadores se resuelven con agregaciones sobre los ids
  de la página (no una query por persona)
