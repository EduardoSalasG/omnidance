# Delta: academies/class-levels

## ADDED Requirements

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
