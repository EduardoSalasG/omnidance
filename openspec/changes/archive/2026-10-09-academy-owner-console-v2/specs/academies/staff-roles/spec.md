# Delta — academies/staff-roles

## ADDED Requirements

### Requirement: Consola de instructor fuera de la lente owner

`/academia/clases` (consola "Mis clases" del instructor) MUST NOT
aparecer en la navegación del rol ACADEMY_OWNER (drawer móvil ni
sidebar desktop). Una persona navegando con la lente ACADEMY_OWNER que
llegue a esa ruta SHALL ser redirigida a `/inicio`. La lente INSTRUCTOR
(y quienes tengan ambos roles y la elijan) conserva el acceso.

#### Scenario: owner entra a mis clases

- **GIVEN** una persona con rol ACADEMY_OWNER navegando con esa lente
- **WHEN** abre `/academia/clases`
- **THEN** es redirigida a `/inicio` y el drawer nunca lista el módulo

#### Scenario: instructor conserva la consola

- **GIVEN** una persona con lente INSTRUCTOR
- **WHEN** abre `/academia/clases`
- **THEN** ve sus clases asignadas como antes
