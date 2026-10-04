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

- [ ] `POST /academies/:id/subscribe` (tier + ciclo) → checkout Flow
      suscripción → `Subscription` existente
- [ ] `PATCH /academies/:id/subscription` (cambio de tier/ciclo; prorateo
      manual v1 o aplica en próxima renovación)
- [ ] `POST /academies/:id/subscription/cancel` (efecto al fin del ciclo)
- [ ] `GET /academies/:id/billing` — estado: tier, alumnos activos vs
      límite, próxima facturación, días de gracia restantes
- [ ] Tier enforcement al suscribir: `activeStudents > tier.max` → 400
      con copy honesto (debe bajar alumnos o subir de tier)

## S3 — Enforcement de mora

- [ ] Job diario: `billingGraceUntil < now` → `billingBlockedAt`
- [ ] Guard: mutaciones de consola academia → 403 `billing.blocked`
      (read-only permitido)
- [ ] Explore/discover: `GET /academies` + `/classes/browse` excluyen
      academias bloqueadas
- [ ] `POST /classes/:id/book` + checkout academy → 400/403 con copy
      "academia no disponible" (alumno no castigado: historial visible)
- [ ] `RENEWAL_SETTLED` → `billingBlockedAt = null` + gracia reset

## S4 — Fee de comprador en productos academia → 0

- [ ] `checkout.service` no aplica `service_fee` a MEMBERSHIP/WORKSHOP/
      PRIVATE (params a 0 + código defensivo)
- [ ] Checkout UI: sin línea "cargo por servicio" en quote/breakdown
- [ ] Payout de academia: línea `GATEWAY_FEE_PASSTHROUGH`
      (`gateway_fee.academy_passthrough_pct` ≈3.19) separada del net
- [ ] Specs/e2e de payout actualizados

## S5 — Producer Pro

- [ ] `POST /producers/:id/pro/subscribe|cancel` (mismo motor)
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
