# Change: unified-actor-entitlements

## Why

Existen dos mecanismos de gating por suscripción casi idénticos:
`pro.required` (productor, binario) y `tier.required` (academia, por
features). "Pro" como concepto separado es legado de cuando solo
había dos tiers. Un solo contrato + un solo mecanismo reduce
duplicación y prepara los tiers nivelados de Producer Pro
(Pro/Growth/Scale ya especificados) sin tocar call sites.

## What Changes

- Un solo error: `403 {error:"tier.required", upgrade:true,
  requiredTier, feature}` para TODOS los actores; `pro.required` muere.
- Puerto de dominio `ActorEntitlements.resolve(actorType, actorId) →
  {tier, features[]}` con adaptadores `ProducerEntitlements`
  (Person.proTier + proTrialEndsAt; hoy binario → PRO) y
  `AcademyEntitlements` (Academy.tier + estado suscripción).
- `assertActorFeature(actorType, actorId, feature)` reemplaza
  `assertProducerPro`/`assertAcademyTier` en los call sites — cada
  endpoint declara su feature, no el tier nominal.
- `GET /me/entitlements` unificado: `{producer: {tier,features}|null,
  academies:[{id,tier,features}]}` (reemplaza `effectivePro` y
  `/me/academy/entitlements` como fuente del front).
- Front: `useEntitlements` unificado, `TierPaywall` único,
  `isTierRequired` único, `blocked` único en crm-context; fases
  "pro"/"tier" colapsan en analítica.
- Modelo de datos intacto (Person.proTier, Academy.tier se mantienen
  como agregados separados con sus ciclos de vida).
