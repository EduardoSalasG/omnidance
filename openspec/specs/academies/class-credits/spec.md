# academies/class-credits Specification

## Purpose
Los planes de membresía con límite de clases (N por semana en planes por
tiempo, N totales en packs) se convierten en una cuota real: reservar consume
un crédito y cancelar lo devuelve o lo pierde según la política de corte.

## Requirements

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

### Requirement: Consumo solo en estado BOOKED

El sistema SHALL contar como consumidas las reservas en estado `BOOKED` más
las `CANCELLED` con `refunded=false`. `WAITLIST` y `CANCELLED` con
`refunded=true` SHALL NOT consumir crédito.

#### Scenario: Entrar a waitlist no consume

- **WHEN** un alumno con cuota agotada entra a `WAITLIST` en una clase llena
- **THEN** la reserva se acepta como `WAITLIST` sin consumir crédito

#### Scenario: Re-reserva tras cancelación con refund

- **WHEN** el alumno canceló una reserva dentro de la ventana
  (`refunded=true`) y vuelve a reservar la misma clase
- **THEN** la reserva se reactiva consumiendo el crédito nuevamente

### Requirement: Resolución de inscripción que consume

Cuando el alumno tiene múltiples inscripciones vigentes aplicables a la
academia de la clase, el sistema SHALL consumir primero la cuota del plan
semanal (caduca cada semana), luego el pack; un plan ilimitado SHALL
satisfacer la reserva sin consumo. La reserva SHALL registrar el
`enrollmentId` utilizado.

#### Scenario: Alumno con plan semanal y pack

- **WHEN** el alumno tiene un plan `MONTHLY weeklyClasses=1` con crédito y
  un pack con saldo, y reserva una clase
- **THEN** el crédito se descuenta del plan semanal y la reserva registra
  ese `enrollmentId`

### Requirement: Promoción de waitlist con re-check de cuota

Al liberarse un cupo, el sistema SHALL promover al primer `WAITLIST` que
tenga crédito disponible; un candidato sin cuota SHALL mantenerse en espera
y se evalúa el siguiente en orden de llegada.

#### Scenario: Candidato sin cuota

- **WHEN** se libera un cupo y el primer `WAITLIST` ya consumió su cuota
  semanal, pero el segundo tiene crédito
- **THEN** el segundo pasa a `BOOKED` y se le notifica; el primero queda
  `WAITLIST`

### Requirement: Visibilidad de créditos en la ficha

`GET /classes/:id` SHALL incluir `myCredits` para la academia de la clase:
`{kind:"WEEKLY"|"PACK", used, limit}` cuando el alumno tiene inscripción con
cuota, o `null` si su plan es ilimitado o no está inscrito.

#### Scenario: Alumno con plan semanal

- **WHEN** consulta una clase de su academia con 1 reserva consumida de 2
- **THEN** `myCredits = {kind:"WEEKLY", used:1, limit:2}`
