# Proposal: academy-enrich-seed-fixes

## Why

`enrich-academy-seed.cjs` (tooling dev) tenía dos defectos de
idempotencia detectados al materializar la limpieza COBROS:

- **P2002 en `flowSubscriptionId`**: el id determinista
  `sus_enrich_<hash(personId+academyId)>` colisionaba con subs muertas
  (`CANCELED`/`FAILED_CARD` — fuera de `liveSubs`, la persona vuelve a
  ser elegible y reintenta el mismo id) y con picks repetidos de la
  misma persona vía el índice modular o doble enrollment con plan
  pagado. La corrida abortaba a mitad del paso 5.
- **Crear-para-borrar en academias COBROS**: el paso 2 sembraba
  `EnrollmentLevel` en academias COBROS (incluidas las que reciben el
  tier por hash en el paso 5, antes de tenerlo) y los pasos 3-4
  materializaban clases/asistencias que la limpieza COBROS borraba en
  la misma corrida. Converge pero desperdicia y ensucia los contadores.
- **Contadores engañosos**: `mkClaim` devolvía el claim existente y el
  resumen contaba intentos como creaciones (`+1 PENDING, +13 APPROVED`
  en corridas sin escrituras).

## What Changes

- **Idempotencia de subs**: `flowSubscriptionId` pasa por
  `nextFlowSubId` — set de ids tomados precargado + sufijo `_vN` cuando
  el base determinista está ocupado. El pick de alumnos se deduplica
  por `personId` con orden determinista (sort por hash) — una sub por
  persona por academia.
- **`cobrosEffective`**: set computado una vez al inicio (academias en
  tier COBROS + las que el paso 5 convertirá en COBROS por el hash —
  activas, sin PlatformSubscription, fuera de TRIAL_KEEP). Los pasos 2
  (EnrollmentLevel), 3 (slots/clases materializadas), 4 (asistencias y
  normalización de sobre-cupo) y 7 (PrivateLesson REQUESTED) excluyen
  esas academias; la limpieza post-suscripciones queda como red de
  seguridad para residuos anteriores.
- **Contadores reales**: `mkClaim` retorna `null` cuando el claim ya
  existe; el resumen solo cuenta creaciones.
- **Limpieza**: `ensureSeries`/`styleId` (parrilla Tumbao retirada en
  `tier-gates-audit-fixes`) eran código muerto — se eliminan.

## Capabilities

- **New Capabilities**: `academy-demo-seed` — contrato de idempotencia
  y consistencia de tier del enriquecimiento demo de academias.
