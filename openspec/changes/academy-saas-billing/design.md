# Design — academy-saas-billing

## Decisiones tomadas (con el usuario)

| Decisión | Resolución |
|---|---|
| Estructura de tiers | 3 tiers por alumnos activos + semestral −10% / anual −15% / trial 30d |
| Objetivo de pricing | ≈8-9% de la facturación de la academia (ticket $25-35k/alumno-mes) |
| Fee al comprador en productos academia | **Eliminado** — la academia absorbe el costo Flow en su payout |
| Productor | `platformFeePct` por venta se mantiene + suscripción Producer Pro |
| Mora academia | 5 días gracia → día 6 bloqueo total (consola, directorio, reservas) |
| Metered por alumno | Descartado v1 — monto variable complica la suscripción fija Flow |

## Pricing propuesto (params editables en /admin)

| Tier | Max alumnos activos | Mensual | Semestral (−10%) | Anual (−15%) |
|---|---|---|---|---|
| `STARTER` | 50 | $49.990 | $44.990/mes | $42.490/mes |
| `PRO` | 150 | $99.990 | $89.990/mes | $84.990/mes |
| `STUDIO` | 400 | $189.990 | $170.990/mes | $161.490/mes |
| `ENTERPRISE` | ilimitado | a convenir | — | — |

Regla: ≈8.5% de facturación para la academia típica de cada banda; al
tope del tier el % efectivo cae (descuento por volumen implícito que
incentiva crecer dentro del plan). Precios en `PlatformParam`
(`academy_tier.starter_monthly_clp`, etc.) para ajuste sin deploy.

"Alumnos activos" = `Enrollment` en `ACTIVE|TRIAL|ONLINE` de esa
academia (misma definición que usa el CRM).

## Modelo de datos

- `AcademyPlan` (catálogo): `code` (STARTER/PRO/STUDIO/ENTERPRISE),
  `maxActiveStudents`, `monthlyClp`, `semiannualClp`, `annualClp`,
  `active`. Seed con los precios de arriba.
- `Academy.subscriptionId → Subscription` (reuse del modelo existente —
  Flow `subscriptionId`, invoices, RENEWAL_SETTLED/RENEWAL_FAILED en el
  ledger). `Academy.planId`, `Academy.billingCycle`
  (MONTHLY/SEMIANNUAL/ANNUAL), `Academy.billingGraceUntil`,
  `Academy.billingBlockedAt`, `Academy.trialEndsAt`.
- `Producer.proSubscriptionId → Subscription?` (opcional),
  `Producer.proTier` (FREE/PRO).

El trial de 30d no exige tarjeta upfront (decisión: baja fricción —
el owner activa y configura; el bloqueo del día 6 aplica solo a quien
ya tuvo suscripción pagada impaga).

## Enforcement de mora

- Cron/job diario (o check lazy al resolver actor) evalúa
  `billingGraceUntil < now` → `billingBlockedAt = now`.
- Bloqueada ⇒ owner 403 en mutaciones de consola (read-only),
  academia excluida de `GET /academies` explore y de `/classes/browse`,
  `POST /classes/:id/book` rechaza reservas nuevas (alumno ve
  "la academia no está disponible"), checkout academy 400.
- Asistencia histórica y datos del alumno quedan visibles (no
  castigamos al alumno por la mora del owner).
- Pago exitoso → `billingBlockedAt = null` automático en
  RENEWAL_SETTLED.

## Fee de comprador en productos academia → $0

- `service_fee.membership_clp`, `service_fee.private_lesson_clp` y el
  fee de drop-in/workshop pasan a `0` para ventas de academia (params
  default 0 o flag por `orderType` — preferir que checkout.service no
  aplique service_fee para MEMBERSHIP/WORKSHOP/PRIVATE).
- El checkout muestra total = precio plan sin cargo.
- Costo Flow (~3.19%) se descuenta del payout de la academia:
  `PayoutEvent` o línea en liquidación `GATEWAY_FEE_PASSTHROUGH`
  (tasa en param `gateway_fee.academy_passthrough_pct` ≈ 3.19).
- Tickets de eventos (TICKET/DOOR/SERIES_PASS) sin cambio: bailarín
  paga `service_fee` plano, productor paga `platformFeePct`.

## Producer Pro

- `Producer.proTier=PRO` habilita: analítica avanzada, CRM, exports,
  gestión de staff/listas — el gating exacto se fija en los specs;
  el ticketing base (publicar, vender, check-in) queda FREE siempre.
- Suscripción mensual `producer_tier.pro_monthly_clp` (precio por
  definir en implementación — param). Mismo motor Subscription/Flow.
- Mora Producer Pro: solo pierde las features Pro (nunca le bloquea
  vender — el marketplace no se corta).

## Migración

- Academias existentes: `trialEndsAt = now + 60d` (grace de lanzamiento
  más generoso que el estándar — la base actual no pagaba).
- Productores existentes: `proTier=FREE` (nada cambia).
- Enrollments/subscriptions de alumnos intactos (son cobros del
  negocio, no de la plataforma).

## Riesgos

- Flow absorber el 3.19% del payout exige registrarlo en el ledger
  con transparencia (línea separada, no esconderlo en `net`).
- Bloquear academias puede dejar alumnos sin poder reservar clases
  ya pagadas → el copy al alumno debe ser honesto ("la academia no
  está disponible; contacta a tu academia").
- Enterprise "a convenir" → sin tier auto-seleccionable; contacto manual.
