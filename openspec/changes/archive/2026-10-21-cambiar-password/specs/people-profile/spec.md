# Delta: Cambio de contraseña del usuario

## ADDED Requirements

### Requirement: Cambio de contraseña autenticado

`PUT /me/password` SHALL permitir al usuario autenticado cambiar su
contraseña. Si posee `passwordHash`, `currentPassword` SHALL ser
requerida y verificada (error 400 si incorrecta). Si no la posee (solo
magic link), SHALL permitir establecerla sin actual. `newPassword`
mínimo 8 caracteres. La respuesta no expone el hash.

#### Scenario: cambio exitoso con actual correcta

- **WHEN** el usuario envía currentPassword válida + newPassword ≥8
- **THEN** el hash se reemplaza y responde 200/204

#### Scenario: actual incorrecta

- **WHEN** currentPassword no coincide
- **THEN** responde 400 sin mutar el hash

#### Scenario: sin contraseña previa

- **WHEN** una persona magic-link-only envía newPassword ≥8 sin actual
- **THEN** se establece el primer passwordHash
