# Proposal: clase de prueba como cuota de 1 clase agotable

## Resumen

Una inscripción de tipo `TRIAL` ("clase de prueba") no consume cuota:
el resolvedor de créditos solo aplica `classCount` a planes
`CLASS_PACK`, así que cualquier inscripción TRIAL cae en el bucket
"ilimitado" y la ficha del alumno muestra el plan como ilimitado. La
regla de producto confirmada por el dueño: **una clase de prueba otorga
exactamente 1 clase, no es recurrente; se agenda y se agota**.

## Cambios

- El resolvedor de cuota SHALL contar las reservas consumidas de una
  inscripción `TRIAL` contra el `classCount` de su plan (misma mecánica
  que `CLASS_PACK`): al consumirse el crédito, nuevas reservas
  responden 409.
- Los planes `TRIAL` del seed demo se crean con `classCount: 1`.
- La ficha del alumno y los listados de planes muestran el cupo real
  (1 clase) en vez de "ilimitado", derivado del `classCount` del plan.

## Scope

- In: regla de cuota para inscripciones `TRIAL`, seed demo, visibilidad
  del cupo en la ficha del alumno.
- Out: alta de planes TRIAL por consola (form permite `classCount` ya;
  no se obliga el valor), migraciones de datos de prod (los planes
  TRIAL existentes con `classCount = null` siguen siendo ilimitados
  hasta que el owner los edite - decisión consciente: no backfill).

## Specs afectadas

- `academies/class-credits`: la cuota por conteo (`classCount`) aplica
  a cualquier plan que la defina, incluido `TRIAL`; la resolución de
  inscripción que consume y `myCredits` se extienden a TRIAL.
