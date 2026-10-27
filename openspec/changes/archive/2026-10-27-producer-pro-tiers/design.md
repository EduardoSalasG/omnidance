# Design — producer-pro-tiers

## Decisiones

- **Matriz acumulativa por código de enum** (`PRODUCER_TIER_FEATURES`):
  `PRO_STARTER` = `[analytics, exports, multiStaff]`;
  `PRO_GROWTH` = STARTER + `crm`; `PRO_BIG` = las 6. `PRODUCER_TIER_ORDER`
  alineado → `producerRequiredTierFor` devuelve el tier mínimo que cubre
  la feature (`exports`→STARTER, `crm`→GROWTH, `campaigns`/`benchmark`→BIG;
  no mapeada → piso `PRO_STARTER`).
- **Tier efectivo real**: `producerEffectiveTier` devuelve
  `person.proTier` cuando hay tier pago (lo proyecta
  `applyEntitlement`/`settlePlatformSub` desde `PlatformSubscription.tierCode`).
- **Trial → PRO_STARTER**: `proTrialEndsAt` no guarda tierCode — el trial
  de lanzamiento vende el piso Pro (analytics + exports + staff ≤1), no
  el tope de la matriz. Es la decisión documentada del change: un trial
  con CRM completo regalaría la feature que diferencia GROWTH.
- **Cupo de staff** (`PRODUCER_TIER_STAFF_LIMIT` = {STARTER:1, GROWTH:2},
  BIG ausente = sin cupo): se evalúa en `POST /producer/staff` (la
  nómina — `POST /events/:id/staff` solo asigna miembros ya en nómina).
  Re-alta de alguien ya en nómina es idempotente y no consume cupo. El
  check corre **antes** de crear el stub por email — un alta rechazada
  no deja Person huérfana.
- **Gate `multiStaff` en la nómina**: `POST /producer/staff` queda bajo el
  mismo feature que la asignación a evento — FREE sin Pro → 403
  `tier.required` (la nómina sin capacidad de asignar era superficie
  inerte; "FREE sin Pro sigue sin acceso"). Admin soporte nunca se
  gatea ni consume cupo (`assertProducerOrAdmin` devuelve isAdmin).
- **Shape del error de cupo**: 403 `{error:"staff_quota", message, limit,
  used}` (convención `tier_limit` de subscribe: código + mensaje). El
  front mapea `staff_quota` → `producer.collaborators.quotaFull` (i18n).
- **Renovación**: ya existía `enforceProducerTier` (llamado en
  `reconcileSubscription` tras `settled>0 && kind=PRODUCER && ACTIVE`):
  evalúa `producerMonthlyGross` en `sub.currency` contra
  `producerTierForGross`; si el requerido supera `sub.tierCode` →
  `pendingTierCode` + `pendingBillingCycle` + cancel de la remota a fin
  de período + `producer.pro_upgrade_required` (dedup una vez por tier
  requerido; sobre el tope autogestionado solo avisa — PRO_BIG manual).
  Nunca baja features ni corta ventas en curso.
- **Vista Pro**: `producerProView` expone `staffUsed` (count
  ProducerStaff), `staffLimit` (del mapa; null = sin cupo o sin Pro) y
  `enabledFeatures` (de `producerEntitlement`). El front muestra cupo e
  "Incluye" solo cuando `effectivePro`.
