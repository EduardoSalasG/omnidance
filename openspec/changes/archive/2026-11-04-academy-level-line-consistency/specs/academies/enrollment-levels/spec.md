# Delta: academies/enrollment-levels

## ADDED Requirements

### Requirement: Opciones del editor = línea efectiva de la academia

El editor de niveles del alumno SHALL ofrecer como opciones solo los
niveles de la línea efectiva de la academia del enrollment (custom si
existe, global si no), nunca la unión de ambas.

#### Scenario: Alumno de academia con línea custom

- **GIVEN** un enrollment de Mambo Madness (línea custom)
- **WHEN** el staff abre el editor de niveles por tipo
- **THEN** las chips muestran los niveles custom (Iniciación,
  Iniciación 2, Básico, Intermedio, Avanzado) y al guardar persiste
  `levelId`s de esa línea
