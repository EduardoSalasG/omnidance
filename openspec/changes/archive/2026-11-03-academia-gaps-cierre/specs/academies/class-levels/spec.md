# Delta; academies/class-levels

## ADDED Requirements

### Requirement: Línea de niveles propia o herencia global

La academia SHALL definir su propia línea de niveles (`ClassLevel` con
`academyId`) o heredar la línea global (`academyId: null`, la que usan
los sociales y edita el negocio en /admin/catalogos). Sin filas propias
la academia usa la global (`usingGlobal: true`); con una o más filas
propias su línea reemplaza a la global solo para esa academia. El
mantenedor (`GET/POST/PATCH/DELETE /academies/:id/class-levels`)
requiere la capability `schedule` (lectura) y su escritura
(`requireCapabilityWrite`).

#### Scenario: Herencia por defecto

- **WHEN** una academia no tiene niveles custom
- **THEN** `GET /academies/:id/class-levels` responde
  `usingGlobal: true` y el insight/agenda numeran la línea global

#### Scenario: Borrado de nivel en uso rechazado

- **WHEN** se intenta `DELETE /academies/:id/class-levels/:levelId`
  sobre un nivel referenciado por series o `EnrollmentLevel`
- **THEN** la API responde 409 y el nivel queda intacto

### Requirement: Reset a la línea global

`DELETE /academies/:id/class-levels` SHALL borrar todos los niveles
custom de la academia en una sola operación (vuelta a la línea
global), con la misma capability de escritura que el resto del
mantenedor. Si algún nivel custom está en uso (series o
`EnrollmentLevel`), la API SHALL responder 409 sin borrar nada, con
los nombres de los niveles bloqueados en el mensaje. La consola SHALL
ofrecer la acción "Volver a la línea global" con confirmación previa.

#### Scenario: Reset limpio

- **GIVEN** una academia con 3 niveles custom sin uso
- **WHEN** el owner confirma "Volver a la línea global"
- **THEN** se borran los 3 en una sola llamada y
  `usingGlobal` vuelve a `true`

#### Scenario: Reset bloqueado por uso

- **GIVEN** el nivel custom "Pro" referenciado por una serie
- **WHEN** se intenta el reset
- **THEN** la API responde 409 nombrando "Pro", no borra ningún nivel
  y la UI muestra el motivo
