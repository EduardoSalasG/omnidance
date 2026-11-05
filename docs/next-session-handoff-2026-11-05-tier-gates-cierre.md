# Handoff 2026-11-05 — cierre auditoría tier gates

## Completado (commit tras `307abc87`, change `tier-gates-audit-fixes`)

Cierra TODOS los pendientes del handoff `tier-gates-audit` + las
decisiones de producto tomadas en sesión:

- **clases/[id]**: 403 `tier.required` del roster → `TierPaywall`
  (feature `attendance`, patrón `isTierRequired`).
- **P2 niveles**: los 5 endpoints `/academies/:id/class-levels*` y
  `PATCH /enrollments/:id/levels` exigen feature `classes` (además de
  cap `schedule`/`students`). Páginas `configuracion/{clases,niveles,
  niveles/nuevo,niveles/[id]}` con `AcademyTierGate`; nav item
  `configuracion/clases` con `academyFeature:"classes"`; editor de
  niveles del alumno oculto sin `classes`.
- **Cosmético equipo**: `AcademyTierGate staff` en `equipo/[id]`,
  `[id]/editar`, `profesor/[id]`, `profesor/[id]/editar`.
- **P1 → decisión usuario: staff SIN restricción**. Se eliminaron
  `multiStaff` de `PRODUCER_FEATURES`, `PRODUCER_TIER_STAFF_LIMIT`,
  `staff_quota`, param `producer_tier.free_staff_max` (seed-common),
  `staffUsed`/`staffLimit` de la vista de suscripción y de
  `pro-section.tsx`. Front: `staffLocked`/`tierLocked`/`locked` fuera
  de `eventos/[id]`, `StaffSection`, `staff/nuevo`,
  `colaboradores/nuevo`; i18n `tierGate.features.multiStaff` borrada.
- **P3**: campañas CRM (`/crm/campaigns*`, 7 endpoints) exigen feature
  `campaigns` → PRO_BIG (`assertActorAccess` acepta feature opcional;
  ACADEMY sigue en `crm`). **benchmark** = comparativa anónima del
  evento vs la escena; queda en la matriz como reservada sin
  implementación (documentado).
- **Seed COBROS**: `enrich-academy-seed.cjs` ya no crea parrilla/
  bookings para Tumbao y agrega limpieza idempotente post-suscripciones:
  toda academia tier COBROS pierde instructores, staff, series/slots/
  clases (+bookings/attendances/videos), particulares, EnrollmentLevel
  y ClassLevel custom; `privateLessonPrice` → null.

## Verificado

- `tsc --noEmit` API y web: limpios.
- Vitest API specs tocados (producer/events/actor-entitlements/
  platform-subscriptions): **156/156 verde**.
- `openspec validate tier-gates-audit-fixes`: válido.
- `node --check` del enrich: OK.

## Pendiente

- **Archivar el change** (`openspec archive tier-gates-audit-fixes`)
  tras verificar smoke — las specs canónicas aún no reciben los deltas.
- Correr `pnpm db:enrich` contra la DB dev para materializar la
  limpieza COBROS en las 3 academias observadas (As you wish,
  Acrodance, Ritmo y Guaperia) + Tumbao.
- Smoke manual pendiente del handoff anterior: confirmar fix P0 en
  browser y el paywall nuevo del roster con cuenta COBROS.
- Suite web completa (`pnpm test`) no corrida en esta sesión — solo
  typecheck; correr antes del archive si hay duda.
