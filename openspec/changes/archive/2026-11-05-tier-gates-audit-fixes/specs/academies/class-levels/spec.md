# Delta: academies/class-levels

## MODIFIED Requirements

### Requirement: Línea de niveles propia o herencia global

La academia SHALL definir su propia línea de niveles (`ClassLevel` con
`academyId`) o heredar la línea global (`academyId: null`, la que usan
los sociales y edita el negocio en /admin/catalogos). Sin filas propias
la academia usa la global (`usingGlobal: true`); con una o más filas
propias su línea reemplaza a la global solo para esa academia. El
mantenedor (`GET/POST/PATCH/DELETE /academies/:id/class-levels`)
requiere la capability `schedule` (lectura) o su escritura
(`requireCapabilityWrite`) **y la feature de tier `classes`** - una
academia sin clases (COBROS) recibe 403 `tier.required` en todo el
mantenedor, no solo en la consola.

#### Scenario: Herencia por defecto

- **WHEN** una academia no tiene niveles custom
- **THEN** `GET /academies/:id/class-levels` responde
  `usingGlobal: true` y el insight/agenda numeran la línea global

#### Scenario: COBROS no mantiene niveles

- **GIVEN** una academia tier COBROS (sin feature `classes`)
- **WHEN** el owner llama cualquier endpoint de `class-levels`
- **THEN** la API responde 403 `tier.required` (feature `classes`,
  requiredTier STUDIO)

#### Scenario: Borrado de nivel en uso rechazado

- **WHEN** se intenta `DELETE /academies/:id/class-levels/:levelId`
  sobre un nivel referenciado por series o `EnrollmentLevel`
- **THEN** la API responde 409 y el nivel queda intacto
