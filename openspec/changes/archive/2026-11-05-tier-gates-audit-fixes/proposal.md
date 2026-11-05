# Proposal: tier-gates-audit-fixes

## Why

La auditoría de entitlements academy/productor (handoff 2026-11-05)
dejó inconsistencias entre la matriz de tiers y lo implementado:

- `/academia/clases/[id]` muestra el 403 `tier.required` del roster como
  "forbidden" genérico en vez del `TierPaywall`.
- Los endpoints del mantenedor de niveles (`/academies/:id/class-levels`)
  y `PATCH /enrollments/:id/levels` usan capability sin feature: COBROS
  puede CRUD niveles por API y abrir las páginas de configuración.
- Las fichas de `/academia/equipo/*` no tienen `AcademyTierGate` (solo la
  lista y `/nuevo`): COBROS recibe 403 genérico, no paywall.
- El cupo de staff del productor (`free_staff_max` por evento y nómina)
  sobre-gatea el caso real: los productores trabajan con 1-2 personas;
  la restricción se elimina completa (feature `multiStaff`, param
  `producer_tier.free_staff_max`, error `staff_quota` y límites por tier).
- `POST/GET /crm/campaigns*` gatea `crm` (GROWTH+) pero la spec reserva
  `campaigns` a PRO_BIG. `benchmark` queda reservada sin implementación.
- El seed demo deja academias COBROS con instructores, series, clases y
  niveles de alumno — contradictorio con "cobranza pura".

## What Changes

- **API**: `class-levels` (GET/POST/PATCH/DELETE ×2) y
  `PATCH /enrollments/:id/levels` pasan a exigir feature `classes`
  (403 `tier.required` en COBROS). Endpoints de campañas CRM pasan a
  feature `campaigns` (PRO_BIG). Se elimina el gateo de staff:
  `POST /events/:id/staff` y `POST /producer/staff` ya no chequean cupo
  ni `multiStaff`; salen `PRODUCER_TIER_STAFF_LIMIT`, `staff_quota`,
  `multiStaff` de la matriz y `staffUsed`/`staffLimit` de la vista de
  suscripción.
- **Web**: `clases/[id]` mapea `tier.required` → `TierPaywall`
  (patrón `isTierRequired`); páginas `configuracion/{clases,niveles*}`
  y fichas `equipo/*` se envuelven en `AcademyTierGate`; el editor de
  niveles del alumno se oculta sin feature `classes`; se eliminan los
  gates `multiStaff` de staff de evento y colaboradores.
- **Seed**: `enrich-academy-seed.cjs` deja de crear parrilla para
  Academia Tumbao (COBROS) y añade limpieza post-suscripción: toda
  academia en tier COBROS pierde instructores, staff, series/slots/
  clases (con reservas/asistencias), clases particulares, niveles de
  alumno y niveles custom.
- **Docs**: `omni-dance.md`, inventario QA y specs reflejan la matriz
  final.

## Capabilities

- **Modified Capabilities**: `producer-pro` (features: sin límites de
  staff, `campaigns` exige PRO_BIG), `academies/class-levels`
  (mantenedor exige feature `classes`), `academies/enrollment-levels`
  (`PATCH /enrollments/:id/levels` exige `classes`), `academy-billing`
  (paywall `tier.required` consistente en roster/fichas/config).

## Impact

- API: `academies.controller.ts`, `enrollments` (`setLevels`),
  `events.controller.ts`, `producer.controller.ts`,
  `actor-entitlements.ts` (matriz), `platform-subscriptions.service.ts`
  (vista), `crm.controller.ts` (campaigns), specs de tests tocados.
- Web: `clases/[id]`, `configuracion/{clases,niveles,niveles/nuevo,
  niveles/[id]}`, `equipo/*` (4 páginas), `staff-section` (producer),
  `eventos/[id]` y `staff/nuevo`, `colaboradores/nuevo`, BottomNav.
- Seed: `apps/api/scripts/enrich-academy-seed.cjs`, `seed-common.ts`
  (param `free_staff_max`).
- Sin migración de schema.
