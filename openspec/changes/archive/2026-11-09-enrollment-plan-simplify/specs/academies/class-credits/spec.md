# Delta: class-credits

## MODIFIED Requirements

### Requirement: Cuota de créditos por inscripción

El sistema SHALL mantener una cuota de clases por inscripción vigente
(status `ACTIVE`): `MembershipPlan.weeklyClasses` define el límite por
semana ISO (lun–dom, sobre `Class.date` UTC) para cualquier tipo;
`null` = sin límite semanal. `MembershipPlan.classCount`, cuando está
definido en cualquier tipo de plan, define el total de reservas
consumibles dentro del **ciclo pagado vigente** de la inscripción;
`null` = sin límite por conteo.

#### Scenario: Plan semanal con cuota

- **WHEN** un alumno con plan de `weeklyClasses = 2` tiene 2 reservas
  consumidoras en la semana de la clase objetivo
- **THEN** `POST /classes/:id/book` responde 409 indicando que agotó sus
  clases de la semana

#### Scenario: Plan ilimitado

- **WHEN** el plan tiene `weeklyClasses = null` y `classCount = null`
- **THEN** reservar nunca falla por cuota (sigue exigiendo inscripción
  ACTIVE y capacidad/waitlist)

#### Scenario: Pack de clases

- **WHEN** el plan es `CLASS_PACK` con `classCount = 8` y el alumno ya
  consumió 8 reservas en la vigencia de la inscripción
- **THEN** reservar responde 409

#### Scenario: Tope por ciclo pagado

- **WHEN** un plan tiene `classCount = 8` y el alumno ya consumió 8
  reservas dentro del ciclo pagado vigente `[max(startedAt,
  endsAt − duración), endsAt]`
- **THEN** reservar responde 409, y `myCredits` reporta
  `kind:"PACK", used:8, limit:8`

#### Scenario: Renovación reinicia el conteo

- **WHEN** una inscripción MONTHLY con `classCount` renueva su
  `endsAt` (+1 mes)
- **THEN** el conteo de consumidas vuelve a contar desde el inicio del
  nuevo ciclo (`endsAt − duración`), no desde el alta histórica

#### Scenario: Clase de prueba como pack de 1

- **WHEN** una inscripción ACTIVE con plan CLASS_PACK `classCount = 1`
  ("clase de prueba", price 0 o >0) ya consumió su única reserva
- **THEN** reservar otra clase responde 409 y `myCredits` reporta
  `kind:"PACK", used:1, limit:1`
