# Tasks — academy-saas-billing

## S1 — Datos + catálogo

- [x] ~~`AcademyPlan` model~~ → enums `AcademyTier`/`BillingCycle`/
      `ProducerProTier`/`PlatformSubKind` + seed de `PlatformParam`
      (`academy_tier.*`, `producer_tier.*`, `academy_billing.*`,
      `gateway_fee.academy_passthrough_pct`) — precios/límites por params,
      no por tabla
- [x] `Academy`: `tier`, `billingCycle`, `billingGraceUntil`,
      `billingBlockedAt`, `trialEndsAt` — la suscripción vive en el modelo
      `PlatformSubscription` (no `planId`/`subscriptionId` sueltos)
- [x] ~~`Producer.proTier` + `proSubscriptionId`~~ → `Person.proTier`
      (`ProducerProTier @default(FREE)` — no hay tabla Producer; producerId =
      personId del rol PRODUCER) + `PlatformSubscription.kind=PRODUCER`
- [x] Migración versionada (`…_saas-billing`, create-only) + backfill
      (academias existentes → `trialEndsAt` = now + 60d; productores → FREE
      vía default del enum, sin UPDATE)

## S2 — Facturación de la suscripción

- [x] `POST /academies/:id/subscribe` (tier + ciclo) → registro de
      tarjeta Flow → `PlatformSubscription` PENDING_CARD →
      `POST /api/payments/flow/platform-customer-return` (callback del
      disclaimer) → subscription/create → ACTIVE
- [x] `PATCH /academies/:id/subscription` — upgrade de tier inmediato
      (swap Flow: cancel remota inmediata + create en el plan nuevo,
      cobra el ciclo completo — prorateo manual v1); downgrade/cambio de
      ciclo queda en `pendingTierCode`/`pendingBillingCycle` + cancel
      remota a fin de período y el reconcile recrea la sub en el plan
      pendiente
- [x] `POST /academies/:id/subscription/cancel` (efecto al fin del ciclo)
- [x] `GET /academies/:id/billing` — estado: tier, alumnos activos vs
      límite, próxima facturación, trial, días de gracia restantes,
      bloqueo e invoices (Payment PLATFORM_SUB)
- [x] Tier enforcement al suscribir y al cambiar tier:
      `activeStudents > tier.max` → 400 `{error:"tier_limit", active,
      max}` con copy honesto (debe bajar alumnos o subir de tier)
- [x] Reconcile recurrente (webhook subscription/callback compartido +
      cron 09:00): invoices pagadas → Payment `platsub_<subId>_<inv>` +
      RENEWAL_SETTLED (dedup `lastInvoiceId`/refId); mora →
      `billingGraceUntil = now + academy_billing.grace_days` + notify +
      RENEWAL_FAILED; Producer Pro → `POST /producers/:id/pro/subscribe|
      cancel` + `GET /producers/:id/pro` con tier por facturación 90d
- [x] `POST /academies` siembra `trialEndsAt` = now +
      `academy_billing.trial_days`

## S3 — Enforcement de mora

- [x] Job diario: `billingGraceUntil < now` → `billingBlockedAt`
      (`PlatformSubscriptionsService.enforceAcademyBlocks`, mismo tick del
      cron 09:00 — updateMany condicional + notify `academy.billing_blocked`)
- [x] Guard: mutaciones de consola academia → 403 `billing.blocked`
      (read-only permitido) — centralizado en
      `AcademyAccess.requireManageWrite/requireAdministerWrite`; billing
      (subscribe/PATCH/cancel + GET billing) queda en `requireAdminister`
- [x] Explore/discover: `GET /academies` + `/classes/browse` +
      `GET /styles/:id/landing` + sugerencia "próxima clase" de /home
      excluyen academias bloqueadas (`billingBlockedAt: null`)
- [x] `POST /classes/:id/book` + checkout academy (membership, clase
      suelta, particular, membership-subscription) → 400/403 con copy
      "academia no disponible" (alumno no castigado: historial visible —
      enrolled/mine/profile exponen `billingBlocked:true`)
- [x] `RENEWAL_SETTLED` → `billingBlockedAt = null` + gracia reset
      (implementado en S2 vía `settlePlatformSub` — el cobro recuperado
      desbloquea sin esperar al job)

## S4 — Fee de comprador en productos academia → 0

- [ ] `checkout.service` no aplica `service_fee` a MEMBERSHIP/WORKSHOP/
      PRIVATE (params a 0 + código defensivo)
- [ ] Checkout UI: sin línea "cargo por servicio" en quote/breakdown
- [ ] Payout de academia: línea `GATEWAY_FEE_PASSTHROUGH`
      (`gateway_fee.academy_passthrough_pct` ≈3.19) separada del net
- [ ] Specs/e2e de payout actualizados

## S5 — Producer Pro

- [x] `POST /producers/:id/pro/subscribe|cancel` + `GET /producers/:id/pro`
      (mismo motor — implementado en S2; el tier se calcula por
      facturación media 90d contra `producer_tier.*_max_monthly_clp`)
- [ ] Gating: features premium (definir lista: analítica avanzada + CRM +
      exports + multi-staff) → 402/403 con CTA a Pro
- [ ] `platformFeePct` intacto (comisión por venta sigue siendo la
      monetización core del productor)

## S6 — Consola + bailarín

- [ ] `/academia` → sección "Suscripción": tier, alumnos vs límite,
      renovación, cambiar plan, historial de invoices (del ledger)
- [ ] Banner de gracia (5 días) + banner de bloqueo en consola
- [ ] Checkout de contratación del plan (mismo interstitial pre-Flow)
- [ ] Bailarín: academia bloqueada no aparece en explorar; ficha
      muestra "no disponible" sin CTA de compra; copy honesto
- [ ] Productor: upgrade a Pro desde `/productor/parametros` o la
      superficie Pro bloqueada

## S7 — Cierre

- [ ] Specs canónicas: `academy-billing`, `academy-access`,
      `producer-pro`, ajuste a `payments/*`
- [ ] `architecture.md`: modelo SaaS, enforcement, passthrough Flow
- [ ] `omni-dance.md`: modelo de negocio actualizado
- [ ] OpenAPI/Postman regen
- [ ] Handoff actualizado
