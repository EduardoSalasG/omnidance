# Handoff; 2026-10-25 (release 1.10.0 desplegada)

## Estado

`main` = `dev` = `41d4852d`; **1.10.0 en producción verificado** (API 200 `/api/features`, Netlify 200). CI/CD verde tras 2 fixes de specs (expectativas `myQuota` + DI `AcademyPromosService` en wiring.e2e).

## Entregado en esta sesión

- **Entitlements unificados**: `tier.required` único (`pro.required` eliminado); `ActorEntitlements` + `assertActorFeature`; `GET /me/entitlements`; `TierPaywall` + `useEntitlements` en front.
- **Tiers academia corregidos** (params stale + DB): COBROS 39.990/≤60, STUDIO 79.990/≤150, PRO 119.990/∞. Ciclos unificados: semestral −8% (×5.52), anual −15% (×10.2); misma política ambas líneas.
- **PlatformPromo** (`/admin/facturacion/promos`): descuentos admin → subs plataforma. Whitelist por actor, maxCycles por cobros, reprice al expirar (drift-check en reconcile). Retroactiva a subs existentes.
- **AcademyPromo** (`/academia/promos`): becas/descuentos academia→alumnos; whitelist admite NO inscritos (preventa); audita `Payment.academyPromoId`; `MembershipSubscription.promoId/planChargeClp/pendingReprice`.
- **Gating fino** (academy-tier-v2): leaks COBROS cerrados (score/CRM/asistencia/insights/clases-hoy); consultas rápidas→PRO (`analytics`); crear academia→PRO (`multiAcademy`); chip de plan en cards.
- **Reporte cobranza**: `GET /academies/:id/billing-report` + `/academia/cobros/reporte`; piso de todos los tiers.
- **Home bailarín tier-aware**: `my-quota` devuelve `MEMBERSHIP` (plan+vigencia) para academias sin `classes`; `classesMonth` solo con academias con clases o asistencia real del mes (clase suelta re-habilita).
- **Drift índices**: 5 `@@index` redeclarados + migración `IF NOT EXISTS`; `migrate diff` schema↔DB vacío.

## Demo accounts (dev, `omnidance123`)

- Owners academia: `tumbao@` (COBROS/30), `muvet@` (STUDIO/55), `gabriel@` (PRO/96; era gazner3203, correo real corregido).
- Alumnas: `martina@` (Tumbao/COBROS), `antonia@` (MuéveteOnTour/STUDIO, vence 03-nov).

## Decisiones de producto registradas

- Overage por alumno adicional: **descartado** por el usuario (cap duro + gracia + upgrade; overage barato retrasa upgrades).
- Descuentos: promo paramétrica (PlatformPromo) elegida sobre cupones y overrides en actor (normalización).
- Analítica: STUDIO = operacional (KPIs día, asistencia, ocupación); PRO = estratégica (consultas, insights, benchmark); COBROS = solo cobranza.
- Aniversario de cobro (Flow): día de contratación, Flow maneja meses cortos (clamp al último día).
- Gateways: Flow primario CL (subs+tarjetas), Fintoc preferente A2A/payouts, MP para expansión LatAm, SumUp descartado.

## Gaps / pendientes honestos

- Producer Pro nivelado (Pro/Growth/Scale con features diferenciadas): estructura lista (`PRODUCER_TIER_FEATURES`), mapeo hoy binario; change propio.
- Landing marketing no honra flags de línea (residual conocido).
- Params de prod: verificar que `academy_tier.*` quedaron con los valores nuevos tras seed baseline (el seed no pisa params existentes; si prod tenía los viejos, actualizar por /admin/parametros).
- `impeccable detect` no corrido sobre los diffs de UI nuevos (promos/reporte).
- E2e smoke no cubre: gates por tier reales (necesita subs activas), promos end-to-end.
