# Tasks: academy-tier-gate-staff

1. [x] Test RED: component test de `AcademyTierGate` — staff/instructor sin
   entitlements propios con `academy.tier=STUDIO` debe renderizar el
   contenido (hoy falla: muestra paywall).
2. [x] Fix: `AcademyTierGate` gatea con `academyTierHas(academy.tier, feature)`
   en vez de `useActorEntitlements`; conserva `TierPaywall` como estado
   bloqueado.
3. [x] Verificar suite web + typecheck + lint.
4. [x] Actualizar `docs/qa-flows-inventory.md` §gate por tier (staff/instructor
   cubiertos por el mismo gate que el owner).
