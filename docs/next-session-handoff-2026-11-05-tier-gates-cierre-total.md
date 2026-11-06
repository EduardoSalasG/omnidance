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

## Correcciones post-cierre (mismo día, change `academy-enrich-seed-fixes`)

- **El fix del enrich sí pasó por OpenSpec**: change
  `academy-enrich-seed-fixes` creado, validado y archivado - spec nueva
  `academy-demo-seed` con 2 requisitos (idempotencia por clave natural
  + sufijo `_vN`; COBROS no recibe data de clases).
- **`cobrosEffective`**: el enrich ya no crea-para-borrar en academias
  COBROS. Set computado una vez (tier actual + las que el paso 5
  convertirá en COBROS por hash, sin PlatformSubscription y fuera de
  TRIAL_KEEP) y excluido de EnrollmentLevel, slots/clases
  materializadas, asistencias, normalización de sobre-cupo y
  PrivateLesson. Limpieza queda como red de seguridad.
- **Contadores honestos**: `mkClaim` retorna null si el claim existe -
  el resumen ya no reporta intentos como creaciones (`+0/+0`).
- Código muerto eliminado: `ensureSeries`/`styleId`.
- Verificado: `db:enrich` re-corrida → `COBROS limpio` todo en 0,
  slots vivos 93 (eran 117), claims +0/+0, validate + archive OK.

## Auditoría seed por tier + relleno (change `academy-enrich-history-fill`)

Audit completo por academia vs matriz (COBROS=billing+students ·
STUDIO=+clases/asistencia/staff/exports/preventas · PRO=+analytics/crm/
videos/insights/multiAcademy · null/trial=nivel STUDIO): COBROS 100%
consistente; gaps rellenados y verificados:

- **Historia sep→dic**: clases sep 701 / oct 805 / nov 787 / dic 450;
  asistencias sep 8.3k / oct 10.4k / nov 1.2k. Clases pasadas sin
  reserva reciben ClassBooking BOOKED determinista del roster (shape
  reserva→asistencia real).
- **Claims multi-mes**: +81 APPROVED repartidos sep/oct/nov (era solo
  mes actual + anterior).
- **Staff**: +16 `AcademyStaff` (canStudents+canSchedule) - una por
  academia STUDIO+/trial que no tenía.
- **Videos**: +6 (top-up 3 en La Casa del Mambo y Santiago Baila Salsa;
  Mambo Madness ya tenía 3).
- **Niveles custom**: +3 en La Gozadera (además de Mambo Madness).
- Re-corrida: todo +0 - idempotente confirmado.

## Notas / gaps conocidos

- Stack dejado: `next dev` en :3000 (levantado por esta sesión),
  API prod `dist/main` en :4000 (pid 30540, de antes).
- No se actualizó `qa-flows-inventory.md`: el smoke script es tooling
  dev, no un flujo de usuario nuevo.
- La persona `academias@omnidance.dev` es owner de 3 academias COBROS
  (Ritmo y Guaperia, As you wish, Acrodance); `tumbao@` de Tumbao -
  ambas sirven para QA de gates COBROS.
