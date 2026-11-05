# Proposal: academy-tier-gate-staff

## Why

`AcademyTierGate` resuelve los entitlements via `useActorEntitlements`, que
solo cubre las academias **propias** del caller (`GET /me/entitlements` →
`academy.ownerId = personId`). Staff e instructores de una academia con tier
que cubre la feature ven `TierPaywall` en `/academia/series`, `/videos`,
`/particulares`, `/preventas` y `/equipo` — aunque el API los dejaría pasar.
El gate front debe derivar la feature del `academy.tier` (viaja en
`GET /academies/mine` para owner, staff e instructor por igual), misma regla
que ya aplican `academy-dashboard` y `students-section`.

## What Changes

- `AcademyTierGate` pasa a gatear con `academyTierHas(academy.tier, feature)`
  (espejo front de la matriz) en vez de `useActorEntitlements`. Se mantiene
  el `TierPaywall` como estado bloqueado.
- Tests de componente que cubren owner, staff e instructor con distintos
  tiers.

## Capabilities

- **Modified Capabilities**: `academy-billing` — el requisito "Entitlements
  por tier de academia" pasa a declarar que el gate de consola client-side
  aplica a todo el equipo (owner, staff, instructor), no solo al owner.

## Impact

- `apps/web/src/components/academy/academy-tier-gate.tsx` (único cambio de
  producción).
- Sin cambio de API ni de contrato: el 403 `tier.required` sigue igual.
