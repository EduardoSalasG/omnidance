# Delta: academies/console-lists

## ADDED Requirements

### Requirement: Opciones de filtro sin duplicados por etiqueta

Los selects de filtros de la consola de academia que cosechan opciones
desde filas listadas (academia, serie, plan) SHALL deduplicar sus
opciones por `value` y por etiqueta normalizada (trim + case-fold +
colapso de espacios): dos filas distintas con el mismo nombre visible
renderizan una sola opción.

#### Scenario: academia duplicada en la fuente

- **GIVEN** `/academies/mine` devuelve dos filas con nombre "Mambo
  Madness" e ids distintos
- **WHEN** el selector de academia renderiza
- **THEN** muestra una sola opción "Mambo Madness"

#### Scenario: planes con el mismo nombre

- **GIVEN** dos planes distintos llamados "Ilimitado"
- **WHEN** el filtro Plan renderiza
- **THEN** aparece una sola opción "Ilimitado"
