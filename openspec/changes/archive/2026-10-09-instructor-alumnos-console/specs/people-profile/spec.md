# Deltas: people-profile

## ADDED Requirements

### Requirement: Badges de rol en la identidad del perfil

`/perfil` SHALL mostrar los roles de la persona como badges bajo el
nombre y correo solo cuando son ≤2. Con 3 o más `roleStates` la lista
MUST omitirse — los roles siguen visibles en la sección "Interactuar
como" (que solo lista los APPROVED, con su estado).

#### Scenario: persona con dos roles

- **WHEN** abre `/perfil` con 2 `roleStates`
- **THEN** ve ambos badges bajo su correo (con estado si no es APPROVED)

#### Scenario: persona con tres o más roles

- **WHEN** abre `/perfil` con ≥3 `roleStates`
- **THEN** no hay badges de rol bajo el correo; los roles aparecen en
  "Interactuar como"
