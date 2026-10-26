# people-profile — teléfono por país

## ADDED Requirements

### Requirement: Edición de teléfono con país

`PATCH /me` y `POST /me/complete-profile` SHALL aceptar
`phoneCountryCode` (ISO-2, opcional) como país por defecto para
interpretar el número nacional; la respuesta del perfil SHALL exponer
`phoneCountryCode`. `/perfil/datos`, `/perfil/completar` y
`/bienvenida` SHALL mostrar un selector de país junto al campo de
teléfono.

#### Scenario: usuario elige su país

- **WHEN** el usuario selecciona país `AR` e ingresa `11 5555 1234` en
  `/perfil/datos`
- **THEN** `PATCH /me` persiste `phone="+541155551234"`,
  `phoneCountryCode="AR"` y `GET /me` lo devuelve

#### Scenario: conflicto sobre E.164

- **GIVEN** otra Person con `phone="+56912345678"`
- **WHEN** el usuario guarda `"912345678"` con país CL
- **THEN** `PATCH /me` responde `409 phone_exists`
