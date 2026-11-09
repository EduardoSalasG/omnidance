# Tasks: clase de prueba como cuota agotable

## Implementación

- [ ] 1.1 Test rojo: inscripción `TRIAL` con plan `classCount = 1` y 1
  reserva consumida → `book` responde 409 (espejo del spec de
  `CLASS_PACK` en `classes.controller.spec.ts`).
- [ ] 1.2 `resolveQuota()` en `classes.controller.ts`: la regla de
  conteo pasa de `plan.type === "CLASS_PACK"` a `plan.classCount != null`.
- [ ] 1.3 `seed-dev.ts`: `classCount: 1` en los 5 llamados de plan
  `TRIAL` ("Clase de prueba").
- [ ] 1.4 Verificar que la ficha `/academia/alumnos/[personId]` no
  muestre "ilimitado" para el plan TRIAL con cupo (revisar el render
  de cuota/vigencia del plan; corregir label si hay literal).

## Verificación

- [ ] 2.1 Vitest: spec de classes actualizado verde.
- [ ] 2.2 Repro manual: con el stack local, crear inscripción TRIAL
  con plan `classCount = 1`, reservar 1 clase, intentar reservar otra
  → 409; `myCredits` reporta `kind:"PACK", used, limit:1`.
- [ ] 2.3 `pnpm --filter @omnidance/api build` + typecheck.
- [ ] 2.4 `docs/qa-flows-inventory.md`: entrada de la regla de cuota
  TRIAL.
- [ ] 2.5 Archive del change con specs aplicadas.
