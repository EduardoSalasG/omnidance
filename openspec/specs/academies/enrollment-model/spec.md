# academies/enrollment-model Specification

## Purpose
TBD - created by archiving change enrollment-plan-simplify. Update Purpose after archive.

## Requirements

### Requirement: Estados binarios de inscripción

El sistema SHALL modelar la inscripción del alumno con dos estados:
`ACTIVE` (habilita reserva y cuenta como alumno vigente en KPIs,
billing SaaS, home y claims) e `INACTIVE` (no habilita reserva ni
cuenta como vigente). La transición entre ambos SHALL ser libre en
ambos sentidos (toggle administrativo del owner/staff).

#### Scenario: Reservar con inscripción ACTIVE

- **WHEN** el alumno tiene una inscripción `ACTIVE` vigente en la
  academia de la clase
- **THEN** puede reservar sujeto a cuota y capacidad

#### Scenario: Reservar con inscripción INACTIVE

- **WHEN** el alumno tiene solo inscripciones `INACTIVE` en la academia
- **THEN** reservar responde como sin inscripción vigente (403/409
  según contrato vigente) y no cuenta como alumno activo

#### Scenario: Toggle de estado

- **WHEN** el owner/staff cambia una inscripción ACTIVE → INACTIVE
  o viceversa
- **THEN** la operación se permite sin restricción de dirección

### Requirement: Vigencia rodante del plan

El sistema SHALL calcular `endsAt` de la inscripción como `base +
duración del plan`: MONTHLY +1 mes, QUARTERLY +3 meses, SEMIANNUAL
+6 meses, PERIOD +`periodDays`, SINGLE +1 día, CLASS_PACK `null`
(vence por consumo). La renovación SHALL extender desde el `endsAt`
pagado sin comer ni regalar días. La academia MAY override la fecha en
altas y pagos manuales ("pagado hasta" sigue siendo editable por staff).

#### Scenario: Compra a mitad de mes

- **WHEN** un alumno compra un plan MONTHLY el día 15
- **THEN** `endsAt` = 15 del mes siguiente (duración completa pagada)

#### Scenario: Alta staff sin fecha explícita

- **WHEN** el staff crea una inscripción con plan por tiempo sin
  `endsAt` en el payload
- **THEN** el sistema autocomputa `endsAt = startedAt + duración(plan)`

### Requirement: Venta online de planes gratis

El sistema SHALL rechazar el checkout online de planes con
`price <= 0` de cualquier tipo — los planes gratis se asignan por
staff o claim, no se venden.

#### Scenario: Plan gratis en checkout

- **WHEN** un alumno intenta comprar online un plan con `price = 0`
- **THEN** responde error equivalente a PlanNotPurchasable con copy
  "lo asigna la academia"
