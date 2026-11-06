# Delta: academies/enrollment-levels

## MODIFIED Requirements

### Requirement: Nivel del alumno por tipo de clase

El sistema SHALL registrar el nivel de un alumno por tipo de clase
(`ClassType`: En Pareja | Shines | Corporalidad): un enrollment tiene
a lo más un `EnrollmentLevel` por tipo. Solo el owner/admin de la
academia SHALL poder asignarlo (cap `students` **y feature `classes`**:
una academia COBROS no dicta clases y recibe 403 `tier.required`); el
alumno no se auto-nivela. `PATCH /enrollments/:id/levels` SHALL
rechazar con 400 cualquier entrada que traiga más de un `levelId` para
el mismo `classTypeId`.

#### Scenario: Asignación de un nivel por tipo

- **WHEN** el owner marca al alumno "Básico" en En Pareja
- **THEN** queda un EnrollmentLevel persistido para ese tipo y los
  KPIs lo cuentan una sola vez

#### Scenario: Multi-nivel del mismo tipo rechazado

- **WHEN** el body trae `levelIds: ["ini", "bas"]` para En Pareja
- **THEN** la API responde 400 y no persiste cambio alguno

#### Scenario: COBROS no nivela alumnos

- **GIVEN** una academia tier COBROS (sin feature `classes`)
- **WHEN** el owner llama `PATCH /enrollments/:id/levels`
- **THEN** la API responde 403 `tier.required` (feature `classes`)
