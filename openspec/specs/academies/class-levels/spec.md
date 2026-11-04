# academies/class-levels Specification

## Purpose
TBD - created by archiving change academia-gaps-cierre. Update Purpose after archive.

## Requirements

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

### Requirement: Línea efectiva en catálogos y selects

`GET /classes/catalogs` SHALL aceptar `academyId` opcional. Sin el
parámetro devuelve solo la línea global (`academyId: null`); con él
devuelve la línea efectiva de esa academia (sus niveles custom si
tiene al menos uno, la global si no) - nunca la mezcla de ambas ni
customs de otras academias. Todo select/filtro de nivel de la consola
de academia (formulario de serie, filtro del listado de clases,
editor de niveles del alumno) SHALL poblar sus opciones desde esa
línea efectiva, no del catálogo completo.

#### Scenario: Academia con línea custom

- **GIVEN** Mambo Madness con 5 niveles custom
- **WHEN** la consola pide `GET /classes/catalogs?academyId=<mambo>`
- **THEN** `levels` trae solo sus 5 customs y el select de nivel de la
  serie no muestra "Básico" duplicado

#### Scenario: Academia sin línea custom

- **GIVEN** una academia sin niveles propios
- **WHEN** pide `GET /classes/catalogs?academyId=<id>`
- **THEN** `levels` trae la línea global

#### Scenario: Catálogo público sin academia

- **WHEN** un cliente pide `GET /classes/catalogs` sin `academyId`
- **THEN** `levels` trae solo la línea global, sin customs de ninguna
  academia
