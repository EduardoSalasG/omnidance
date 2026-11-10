# Delta: class-credits

## MODIFIED Requirements

### Requirement: Cuota de créditos por inscripción

El sistema SHALL mantener una cuota de clases por inscripción vigente:
`MembershipPlan.weeklyClasses` define el límite por semana ISO (lun–dom,
calculada sobre `Class.date` UTC) para planes `MONTHLY`/`QUARTERLY`/
`SEMIANNUAL`; `null` significa ilimitado. `MembershipPlan.classCount`,
cuando está definido en cualquier tipo de plan (`CLASS_PACK`, `TRIAL` u
otro), define el total de reservas consumibles durante la vigencia de
la inscripción; `null` significa sin límite por conteo.

#### Scenario: Plan semanal con cuota

- **WHEN** un alumno con plan de `weeklyClasses = 2` tiene 2 reservas
  consumidoras en la semana de la clase objetivo
- **THEN** `POST /classes/:id/book` responde 409 indicando que agotó sus
  clases de la semana

#### Scenario: Plan ilimitado

- **WHEN** el plan tiene `weeklyClasses = null` y `classCount = null`
- **THEN** reservar nunca falla por cuota (sigue exigiendo inscripción
  vigente y capacidad/waitlist)

#### Scenario: Pack de clases

- **WHEN** el plan es `CLASS_PACK` con `classCount = 8` y el alumno ya
  consumió 8 reservas en la vigencia de la inscripción
- **THEN** reservar responde 409

#### Scenario: Clase de prueba agotable

- **WHEN** una inscripción `TRIAL` tiene un plan con `classCount = 1` y
  el alumno ya consumió su única reserva
- **THEN** reservar otra clase responde 409 y `myCredits` reporta
  `kind:"PACK", used:1, limit:1`

### Requirement: Resolución de inscripción que consume

Cuando el alumno tiene múltiples inscripciones vigentes aplicables a la
academia de la clase, el sistema SHALL consumir primero la cuota del plan
semanal (caduca cada semana), luego la cuota por conteo (`classCount` de
`CLASS_PACK`, `TRIAL` u otro tipo); un plan sin cuota SHALL satisfacer la
reserva sin consumo. La reserva SHALL registrar el `enrollmentId`
utilizado.

#### Scenario: Alumno con plan semanal y pack

- **WHEN** el alumno tiene un plan `MONTHLY weeklyClasses=1` con crédito y
  un pack con saldo, y reserva una clase
- **THEN** el crédito se descuenta del plan semanal y la reserva registra
  ese `enrollmentId`
