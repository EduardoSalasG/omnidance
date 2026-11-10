# Design: cuota de clase de prueba

## Decisión

Generalizar la cuota por conteo: `MembershipPlan.classCount != null`
define el total de reservas consumibles durante la vigencia de la
inscripción, independiente del `type` (`CLASS_PACK` hoy, `TRIAL` ahora,
cualquier tipo futuro). El `type` deja de ser la llave; el campo
`classCount` lo es. Un `TRIAL` con `classCount = null` (planes viejos,
creados a mano) sigue siendo ilimitado - regla existente, sin backfill.

## Puntos de cambio

- `apps/api/src/academies/infrastructure/classes.controller.ts`
  `resolveQuota()` (~l.214): la condición `plan.type === "CLASS_PACK"`
  pasa a `plan.classCount != null`. El resto del orden de resolución se
  conserva: semanal con saldo → conteo con saldo → ilimitado.
- `myCredits` (`GET /classes/:id`, ~l.548): la resolución de cuota por
  conteo ya reporta `{kind:"PACK", used, limit}`; una inscripción TRIAL
  con `classCount` reporta `kind:"PACK"` (no se agrega kind nuevo para
  no romper el contrato).
- `apps/api/prisma/seed-dev.ts`: el helper `plan(..., "TRIAL", 0)` se
  llama con `classCount: 1` en las 5 academias (muvet, tumbao, la
  creada en el loop, mambo, adrianLeo).
- Ficha del alumno `/academia/alumnos/[personId]`: el cupo visible se
  deriva del plan; con `classCount = 1` se muestra correcto sin tocar
  UI (verificar que no haya un literal "ilimitado" para TRIAL - si lo
  hay, quitarlo).

## Por qué `classCount` y no hardcodear 1

"Clase de prueba" como producto es 1 clase, pero el campo ya existe y
permite variantes (prueba x2, pack de bienvenida) sin migración.

## Riesgos

- Inscripciones TRIAL existentes en dev/prod: su plan tiene
  `classCount = null` → siguen ilimitadas (comportamiento preservado).
- Orden de resolución: TRIAL compite con otras inscripciones del mismo
  alumno; el orden vigente (semanal → conteo → ilimitado) se conserva.
