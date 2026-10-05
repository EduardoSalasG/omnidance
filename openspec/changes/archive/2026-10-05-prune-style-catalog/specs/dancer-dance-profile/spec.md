# dancer-dance-profile - deltas

## MODIFIED Requirements

### Requirement: Estilos con rol de baile

El perfil MUST permitir declarar por cada `Style` del catálogo un
`DanceRole` (`LEADER | FOLLOWER | SWITCH`) y nivel opcional.
`PUT /api/me/style-roles` SHALL reemplazar el set completo de
`PersonStyleRole` de forma idempotente. `GET /api/styles` SHALL
devolver el catálogo completo ordenado por género. El picker del
perfil (`/perfil/datos`) y el de `/bienvenida` SHALL ofrecer solo el
subconjunto visible del catálogo (denylist `PROFILE_HIDDEN_STYLES`
por nombre); un estilo oculto ya asignado MUST seguir siendo opción
seleccionable en su propia fila para no dejar el borrador vacío.

#### Scenario: Declarar estilos y roles

- WHEN un bailarín guarda `[{styleId: casino, role: LEADER}, {styleId: sensual, role: FOLLOWER}]`
- THEN su `PersonStyleRole` refleja exactamente ese set (agrega/actualiza/elimina)

#### Scenario: Perfil de amigo muestra roles

- WHEN otro usuario abre el perfil del bailarín
- THEN ve sus estilos con el rol declarado (Leader/Follower/Ambos)

#### Scenario: Picker acotado

- WHEN el bailarín abre el selector de estilos en su perfil
- THEN no se ofrecen "Salsa on2", "Bachata dominicana", "Afrocubano",
  "Rueda de casino" ni "Fusión", aunque sigan existiendo en el
  catálogo para series/eventos

#### Scenario: Estilo oculto ya asignado

- WHEN el bailarín ya tenía un `PersonStyleRole` con un estilo oculto
- THEN la fila del draft sigue mostrándolo seleccionado y puede
  quitarse o cambiarse
