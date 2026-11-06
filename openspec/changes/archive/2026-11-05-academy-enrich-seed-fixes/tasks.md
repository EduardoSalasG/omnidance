# Tasks: academy-enrich-seed-fixes

## Seed (enrich-academy-seed.cjs)

- [x] `nextFlowSubId`: set de `flowSubscriptionId` tomados precargado +
  sufijo `_vN` cuando el base determinista está ocupado (subs muertas
  de corridas previas o picks repetidos) — corrige el P2002.
- [x] Pick de alumnos deduplicado por `personId` con orden determinista
  (sort por hash) — una `MembershipSubscription` por persona+academia.
- [x] `cobrosEffective`: set COBROS actual + COBROS-por-hash computado
  una vez (con `tier` en el select de academias y `TRIAL_KEEP`/
  `tierCycle` hoisteados a datos base).
- [x] Exclusión de `cobrosEffective` en: `enrolls` (paso 2),
  `liveSlots` (paso 3), `emptyClasses` + `liveClasses` (paso 4) y
  `PrivateLesson REQUESTED` (paso 7).
- [x] `mkClaim` retorna `null` cuando el claim existe; contadores del
  resumen solo cuentan creaciones.
- [x] Código muerto eliminado: `ensureSeries` + `styleId` (parrilla
  Tumbao retirada en tier-gates-audit-fixes).

## Verificación

- [x] `node --check` del script.
- [x] `pnpm db:enrich` idempotente: `COBROS limpio` reporta 0s (nada
  que borrar — la exclusión evita crear), `slots vivos` 117→93, claims
  `+0/+0` en re-corrida.
- [x] `openspec validate academy-enrich-seed-fixes` válido y archive
  con deltas a la spec `academy-demo-seed`.
