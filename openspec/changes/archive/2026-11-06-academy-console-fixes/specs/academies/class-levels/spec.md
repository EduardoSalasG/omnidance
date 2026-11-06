# Delta: academies/class-levels

## ADDED Requirements

### Requirement: Personalizar copia la línea global como propia

El botón "Personalizar niveles" (en
`/academia/configuracion/niveles` y en `/niveles/nuevo` cuando la
academia aún hereda la global) SHALL crear un nivel propio por cada
nivel global visible, enviando `{name, order}` con
`Content-Type: application/json` igual que el alta manual: la
operación SHALL completar sin errores de validación y dejar a la
academia en modo custom con la línea copiada.

#### Scenario: copiar la línea global

- **GIVEN** una academia sin niveles propios y la línea global con
  4 niveles nombrados
- **WHEN** el owner presiona "Personalizar niveles"
- **THEN** se crean 4 niveles propios con los mismos nombres y orden,
  el aviso de éxito se muestra y el listado pasa a modo custom
