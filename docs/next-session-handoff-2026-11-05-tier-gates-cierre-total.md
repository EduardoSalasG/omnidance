# Handoff 2026-11-05 — cierre total tier gates (archive + smoke + enrich)

## Completado (commit tras `8b523066`)

Cierra TODOS los pendientes del handoff `tier-gates-cierre`:

- **Change archivado**: `openspec archive tier-gates-audit-fixes --yes`
  aplicó deltas a las specs canónicas (academies/class-levels ~1,
  academies/enrollment-levels ~1, academy-billing +1, producer-pro ~1).
  Queda en `openspec/changes/archive/2026-11-05-tier-gates-audit-fixes/`.
- **Tests API al día con la matriz** (12 fallos que el corrida anterior
  no vio porque solo corrió specs tocadas):
  - `enrollment-levels.controller.spec.ts`: `requireCapabilityWrite`
    ahora se aserta con 4to arg `"classes"`.
  - `crm.controller.spec.ts`: campañas exigen feature `campaigns` /
    `PRO_BIG` (FREE, trial STARTER, GROWTH→403 campaigns pero pasa crm;
    test nuevo PRO_BIG→pasa).
  - `gap-crm.e2e.spec.ts`: fixture productores sube a `PRO_BIG`
    (acumulativo: cubre crm + campaigns).
- **Bug idempotencia enrich**: `pnpm db:enrich` fallaba con P2002 en
  `flowSubscriptionId`. Causa raíz: el id determinista
  `sus_enrich_<hash(personId+academyId)>` colisiona con subs muertas
  (CANCELED/FAILED_CARD quedan fuera de liveSubs y la persona vuelve a
  ser elegible) y con picks repetidos de la misma persona en el índice
  modular. Fix: `nextFlowSubId` sufija `_vN` cuando el base está tomado
  + dedupe por personId con orden determinista (sort por hash).
- **db:enrich corrido**: 2 corridas verdes. 1ª: 12 subs nuevas +
  limpieza COBROS materializada (Tumbao, Ritmo y Guaperia, As you wish,
  Acrodance: instructors/series/slots/classes/bookings/attendances/
  enrollmentLevels/classLevels/lessons → 0; privateLessonPrice null).
  2ª: 0 nuevas (idempotencia confirmada). Verificado por query directa:
  las 4 academias COBROS tienen 0 instructores/series/clases/niveles.
- **Smoke browser verde** (stack dev): `apps/api/scripts/
  smoke-tier-gates.cjs` nuevo - crea su propio fixture COBROS
  (serie+slot+clase del día en la 1ª academia tier COBROS, owner como
  profe) y lo borra al final; corre con `cd apps/api && node
  scripts/smoke-tier-gates.cjs` (requiere web :3000 + API :4000 +
  playwright instalado). 5/5 PASS:
  - P0: profe@omnidance.dev (instructora STUDIO) ve /academia/series
    sin paywall ni forbidden genérico.
  - Roster: owner COBROS en /academia/clases/[id] ve TierPaywall
    "Asistencia es de un plan superior / Parte del plan Studio", no el
    forbidden genérico.
  - API directo: GET /api/classes/<cobros>/roster → 403
    `tier.required` feature `attendance` requiredTier `STUDIO`.

## Verificado

- `pnpm test` completo: shared 20/20, web 11/11, api **2480/2480**
  (129 files). Los 12 fallos previos (gap-crm e2e + crm.controller +
  enrollment-levels) quedaron verdes tras actualizar specs.
- `node --check` enrich OK; `openspec validate` válido; archive OK.
- Stack: web corrida con `next dev` (pid nuevo; la corrida anterior
  era `next start` de build pre-b94d2a95 y por eso el smoke browser
  fallaba - cuidado con builds stale al verificar).

## Notas / gaps conocidos

- **Sin change OpenSpec para el fix del enrich**: es tooling dev
  (seed), no comportamiento de producto - omitido explícitamente (G2).
- `enrich` crea EnrollmentLevel en academias COBROS (paso 2) y luego
  los borra (paso 5) - converge pero desperdicia una pasada; mejora
  posible: excluir COBROS del paso 2.
- Stack dejado: `next dev` en :3000 (levantado por esta sesión),
  API prod `dist/main` en :4000 (pid 30540, de antes).
- No se actualizó `qa-flows-inventory.md`: el smoke script es tooling
  dev, no un flujo de usuario nuevo.
- La persona `academias@omnidance.dev` es owner de 3 academias COBROS
  (Ritmo y Guaperia, As you wish, Acrodance); `tumbao@` de Tumbao -
  ambas sirven para QA de gates COBROS.
