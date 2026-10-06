# people-profile — deltas

## ADDED Requirements

### Requirement: Fecha de nacimiento en el perfil propio

`Person` SHALL tener un campo `birthDate` opcional (DateTime nullable,
autodeclarado). El dueño SHALL poder editarlo desde `/perfil/datos`
vía `PATCH /me`, que acepta `{birthDate}` como fecha ISO válida en el
pasado (año ≥ 1900, no futura) o null/empty para limpiarlo.
`GET /me` SHALL devolverlo.

#### Scenario: guardar fecha válida

- **WHEN** el usuario envía `PATCH /me` con `{birthDate: "1994-03-15"}`
- **THEN** se persiste y `GET /me` la devuelve

#### Scenario: fecha inválida

- **WHEN** el usuario envía una fecha futura, un año < 1900 o un
  string que no parsea como fecha
- **THEN** responde 400 sin mutar el perfil

#### Scenario: limpiar fecha

- **WHEN** el usuario envía `PATCH /me` con `{birthDate: ""}` o
  `{birthDate: null}`
- **THEN** el campo queda null
