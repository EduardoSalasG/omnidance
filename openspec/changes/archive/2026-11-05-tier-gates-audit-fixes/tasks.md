# Tasks: tier-gates-audit-fixes

## API

- [x] `class-levels`: GET/POST/PATCH/DELETE(+bulk) exigen feature
      `classes` además de cap `schedule`.
- [x] `PATCH /enrollments/:id/levels` exige feature `classes` además de
      cap `students`.
- [x] Staff: `POST /events/:id/staff` sin cupo ni `multiStaff`;
      `POST /producer/staff` sin cupo de nómina ni `staff_quota`.
- [x] Matriz: `multiStaff` fuera de `PRODUCER_FEATURES` y de los sets
      por tier; `PRODUCER_TIER_STAFF_LIMIT` y referencias eliminadas;
      vista de suscripción sin `staffUsed`/`staffLimit`.
- [x] Campañas CRM (`/crm/campaigns*`) exigen feature `campaigns`
      (PRO_BIG) en vez de `crm`.
- [x] Tests API actualizados (specs que asertaban el gateo viejo).

## Web

- [x] `academia/clases/[id]`: 403 `tier.required` → estado `tier` con
      `TierPaywall` (feature `attendance`).
- [x] `configuracion/clases`, `configuracion/niveles`,
      `niveles/nuevo`, `niveles/[id]`: `AcademyTierGate` `classes`;
      ítem nav de `configuracion/clases` con `academyFeature:"classes"`.
- [x] `equipo/[id]`, `equipo/[id]/editar`, `equipo/profesor/[id]`,
      `equipo/profesor/[id]/editar`: `AcademyTierGate` `staff`.
- [x] `EnrollmentLevelsEditor` oculto cuando la academia no cubre
      `classes`.
- [x] Productor: `staffLocked`/`tierLocked`/`multiStaff` eliminados de
      `eventos/[id]`, `StaffSection`, `staff/nuevo` y
      `colaboradores/nuevo` (`staff_quota`/`tier.required` de staff ya
      no se emiten).
- [x] i18n: `tierGate.features.multiStaff` eliminado.

## Seed

- [x] `enrich-academy-seed.cjs`: sin parrilla/bookings para Tumbao;
      pasada post-suscripciones que limpia grafo de clases, instructores,
      staff, particulares, niveles de alumno y niveles custom en toda
      academia COBROS (+`privateLessonPrice` null).
- [x] `seed-common.ts`: param `producer_tier.free_staff_max` eliminado.

## Docs y verificación

- [x] `omni-dance.md` y spec `producer-pro`: staff sin cupo, campaigns
      BIG, benchmark reservado.
- [x] `docs/qa-flows-inventory.md` actualizado.
- [x] typecheck + tests de las superficies tocadas; `openspec validate`.
