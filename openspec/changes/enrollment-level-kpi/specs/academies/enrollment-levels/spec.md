# Delta; academies/enrollment-levels

## ADDED Requirements

### Requirement: Nivel del alumno por tipo de clase, multinivel

El sistema SHALL registrar el/los niveles de un alumno por tipo de
clase (`ClassType`: En Pareja | Shines | Corporalidad): un enrollment
puede tener uno o más `EnrollmentLevel` (ej. Iniciación + Básico en En
Pareja). Solo el owner/admin de la academia SHALL poder asignarlos;
el alumno no se auto-nivela.

#### Scenario: Asignación multinivel por el owner

- **WHEN** el owner marca al alumno "Iniciación + Básico" en En Pareja
- **THEN** quedan dos EnrollmentLevel persistidos y los KPIs los
  cuentan en ambos niveles
