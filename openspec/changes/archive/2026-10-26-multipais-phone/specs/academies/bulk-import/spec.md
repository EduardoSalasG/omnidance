# academies/bulk-import; teléfono normalizado

## ADDED Requirements

### Requirement: Teléfono del import normalizado

La columna `telefono` del CSV de alumnos SHALL normalizarse a E.164 con
el país de la academia como `defaultCountry`; una fila con teléfono
inválido SHALL reportarse como error de fila sin abortar el import.

#### Scenario: teléfono local de academia chilena

- **WHEN** la fila lleva `telefono=912345678` en una academia CL
- **THEN** la Person creada/matcheada usa `phone="+56912345678"`,
  `phoneCountryCode="CL"`

#### Scenario: teléfono inválido

- **WHEN** la fila lleva `telefono=abc`
- **THEN** la fila reporta `telefono inválido` y las demás filas siguen
