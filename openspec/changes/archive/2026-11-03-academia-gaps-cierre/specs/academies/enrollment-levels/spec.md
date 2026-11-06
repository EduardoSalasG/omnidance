# Delta; academies/enrollment-levels

## REMOVED Requirements

### Requirement: Nivel del alumno por tipo de clase, multinivel

**Reason**: la regla de producto cambió a un nivel por tipo de clase
(el alumno no acumula niveles del mismo tipo; evita conteos duplicados
en "Niveles y cupos"). Reemplazada por "Nivel del alumno por tipo de
clase".

## ADDED Requirements

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
