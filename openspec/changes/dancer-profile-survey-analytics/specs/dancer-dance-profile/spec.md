# dancer-dance-profile

## Purpose

El bailarín declara su género y en qué estilos baila con qué rol (leader/follower/switch), datos que alimentan la analítica de sociales y el matchmaking de baile.

## ADDED Requirements

### Requirement: Género autodeclarado

`Person` SHALL tener `gender` nullable con valores `M | F | OTHER`. El perfil MUST permitir declararlo/cambiarlo; ausente equivale a no declarado (nunca se infiere ni se exige).

#### Scenario: Bailarín declara género

- WHEN un usuario autenticado guarda género `M`/`F`/`OTHER` en su perfil
- THEN `PATCH /api/me/profile` persiste el valor y `GET /api/me` lo devuelve

#### Scenario: Sin género declarado

- WHEN un usuario nunca declara género
- THEN su perfil funciona normal y la analítica lo cuenta como `unknown`

### Requirement: Estilos con rol de baile

El perfil MUST permitir declarar por cada `Style` del catálogo un `DanceRole` (`LEADER | FOLLOWER | SWITCH`) y nivel opcional. `PATCH /api/me/profile` SHALL reemplazar el set completo de `PersonStyleRole` de forma idempotente. `GET /api/styles` SHALL devolver el catálogo agrupado/por género para el picker.

#### Scenario: Declarar estilos y roles

- WHEN un bailarín guarda `[{styleId: casino, role: LEADER}, {styleId: sensual, role: FOLLOWER}]`
- THEN su `PersonStyleRole` refleja exactamente ese set (agrega/actualiza/elimina)

#### Scenario: Perfil de amigo muestra roles

- WHEN otro usuario abre el perfil del bailarín
- THEN ve sus estilos con el rol declarado (Leader/Follower/Ambos)
