# platform-multicountry — contacto normalizado por país

## ADDED Requirements

### Requirement: Teléfono normalizado E.164

Todo write path de `Person.phone` SHALL normalizar con
`normalizePhone(raw, defaultCountry)` (libphonenumber-js): `phone`
persiste E.164 con `+` y `phoneCountryCode` persiste el ISO-2 derivado
del número parseado. Un `+` inicial SHALL sobreescribir el país por
defecto (el número ya declara su país). Números inválidos SHALL
rechazarse con `400 telefono_invalido`. La unicidad de `phone` SHALL
evaluarse sobre el E.164 — dos formatos del mismo número SHALL
resolver a la misma Person.

#### Scenario: formato nacional con país por defecto

- **WHEN** un flujo recibe `"9 1234 5678"` con `defaultCountry="CL"`
- **THEN** persiste `phone="+56912345678"`, `phoneCountryCode="CL"`

#### Scenario: override por prefijo internacional

- **WHEN** un flujo recibe `"+52 55 1234 5678"` con
  `defaultCountry="CL"`
- **THEN** persiste `phone="+525512345678"`, `phoneCountryCode="MX"`

#### Scenario: el mismo número en dos formatos no duplica

- **GIVEN** una Person con `phone="+56912345678"`
- **WHEN** otro write path ingresa `"912345678"` con default CL
- **THEN** ambos normalizan al mismo E.164 y el lookup/conflicto opera
  sobre la misma fila — no se crea ni permite una segunda Person

#### Scenario: teléfono inválido

- **WHEN** un flujo recibe `"123"` o texto no telefónico
- **THEN** responde `400 telefono_invalido` sin persistir
