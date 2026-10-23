# Tasks — unified-actor-entitlements

- [x] 1. API: dominio ActorEntitlements + adapters + matrices
  (PRODUCER_FEATURES, ACADEMY_FEATURES) + assertActorFeature.
- [x] 2. API: migrar call sites de assertProducerPro/requireProSelf a
  assertActorFeature con feature correcta por endpoint; GET
  /me/entitlements unificado; deprecar pro.required.
- [ ] 3. Web: provider+hook unificados, TierPaywall único (CTA por
  actor), isTierRequired único, crm-context blocked único, analítica
  colapsa fases, reemplazo de useAcademyEntitlements/effectivePro.
- [x] 4. Specs: gate producer (sin Pro→403 tier.required), unificación
  del contrato; ajustar specs existentes de pro.required.
- [ ] 5. Docs: openapi/postman regen, qa-inventory, archive.
