# academies/enrollment-levels Specification

## Purpose
TBD - created by archiving change enrollment-level-kpi. Update Purpose after archive.

## Requirements

### Requirement: Nivel del alumno por tipo de clase

El sistema SHALL registrar el nivel de un alumno por tipo de clase
(`ClassType`: En Pareja | Shines | Corporalidad): un enrollment tiene
a lo más un `EnrollmentLevel` por tipo. Solo el owner/admin de la
academia SHALL poder asignarlo; el alumno no se auto-nivela.
`PATCH /enrollments/:id/levels` SHALL rechazar con 400 cualquier
entrada que traiga más de un `levelId` para el mismo `classTypeId`.

#### Scenario: Asignación de un nivel por tipo

- **WHEN** el owner marca al alumno "Básico" en En Pareja
- **THEN** queda un EnrollmentLevel persistido para ese tipo y los
  KPIs lo cuentan una sola vez

#### Scenario: Multi-nivel del mismo tipo rechazado

- **WHEN** el body trae `levelIds: ["ini", "bas"]` para En Pareja
- **THEN** la API responde 400 y no persiste cambio alguno

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
