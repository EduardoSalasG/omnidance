# Handoff 2026-11-05 — auditoría de gates por tier + fix P0

## Completado (commit `7b8ec887`)

- Auditoría completa de entitlements academy/productor vs spec
  (omni-dance.md §10, openspec academy-billing + producer-pro).
- **P0 fix**: `AcademyTierGate` dejó de usar `useActorEntitlements`
  (solo academias del owner) → ahora gatea con
  `academyTierHas(academy.tier, feature)`. Staff/instructor de
  academias STUDIO+ ya no ven paywall en series/videos/particulares/
  preventas/equipo. Test componente nuevo (RED→GREEN), suite web 11/11,
  typecheck + eslint limpios. Change OpenSpec archivado → spec
  `academy-billing` actualizada; qa-flows-inventory §gate actualizado.

## Estado del resto de la auditoría (pendiente)

- **P1 productor — sobre-gateo staff free**: API permite a FREE hasta
  `producer_tier.free_staff_max` (2) por evento y en nómina; el front
  `staffLocked = !has("multiStaff")` oculta "+" y muestra paywall
  (eventos/[id]/page.tsx + staff/nuevo + StaffSection). Un FREE no
  puede agregar sus 2 staff gratis por UI. Y `/productor/colaboradores`
  no gatea nada → 403 llega como error genérico. Fix: mostrar "+" hasta
  el cupo (necesita staffCount en la vista o gatear solo reactivo).
- **P2 academy — niveles sin gate**: endpoints `academyClassLevels`,
  create/update/delete level(s), `setLevels` usan cap `schedule` sin
  feature `classes` → COBROS puede CRUD niveles por API y abrir
  `/academia/configuracion/{clases,niveles}` sin paywall. Inofensivo
  (sin clases no sirven) pero rompe la matriz.
- **P3 productor — campaigns/benchmark nunca se asertan**: toda la
  familia CRM gatea `"crm"` (GROWTH+); spec reserva `campaigns` a
  PRO_BIG y `benchmark` no tiene implementación. Decisión de producto:
  gatear campañas a BIG o absorber en `crm`.
- Cosmético: `equipo/[id]` (ficha) sin `AcademyTierGate` (solo lista y
  /nuevo) → COBROS ve 403 genérico en vez de paywall. Module grid del
  hub filtra por cap, no por tier (staff de COBROS ve cards → paywall).
- Asimetría nav: academy filtra ítems por `academyFeature`; productor
  no filtra nada (paywall al click - aceptable como upsell).

## Verificado

- TDD: `academy-tier-gate.test.tsx` 2/2 (RED→GREEN). Suite web 11/11.
- Typecheck web limpio. ESLint limpio en archivos tocados.
- Web :3000 rebuildeado con el fix; API :4000 dev.

## Hallazgos del smoke manual (usuario, 2026-11-05)

Cuenta de prueba: `profe@omnidance.dev` / `omnidance123` (instructora de
academias en los 3 tiers - ideal para QA de gates).

- **Seed inconsistente con el modelo COBROS**: hay `AcademyInstructor`
  y clases materializadas en las 3 academias COBROS (As you wish,
  Acrodance, Ritmo y Guaperia). COBROS = solo alumnos+planes: limpiar
  instructores/series/clases del seed para esas academias (enrich o
  seed-dev).
- **`/academia/clases/[id]` mapea mal el 403 tier.required**: el roster
  (`GET /classes/:id/roster`) gatea `attendance` correctamente, pero la
  página muestra el estado forbidden genérico ("Esta vista es para
  instructores") en vez de TierPaywall. Fix: `isTierRequired` →
  TierPaywall (patrón de analytics-section).
- **No-bug aclarado**: instructora de la academia que NO es profe de la
  clase no puede marcar asistencia (canMark=false) - es por diseño;
  candidato a hint explicativo en la UI.
- Pendiente: confirmar en browser el fix P0 (contenido en STUDIO).
