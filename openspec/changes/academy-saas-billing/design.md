# Design — academy-saas-billing

## Decisiones tomadas (con el usuario)

| Decisión | Resolución |
|---|---|
| Estructura de tiers | 3 tiers por alumnos activos + semestral −2% / anual −4% / trial 30d |
| Objetivo de pricing | ≈8-9% de la facturación de la academia (ticket $25-35k/alumno-mes) |
| Fee al comprador en productos academia | **Eliminado** — la academia absorbe el costo Flow en su payout |
| Productor | `platformFeePct` por venta se mantiene + suscripción Producer Pro con tiers por facturación |
| Mora academia | 5 días gracia → día 6 bloqueo total (consola, directorio, reservas) |
| Metered por alumno | Descartado v1 — monto variable complica la suscripción fija Flow |

## Pricing propuesto (params editables en /admin)

### Academia

| Tier | Max alumnos activos | Mensual | Semestral (−2%) | Anual (−4%) |
|---|---|---|---|---|
| `STARTER` | 50 | $49.990 | $48.990/mes | $47.990/mes |
| `PRO` | 150 | $99.990 | $97.990/mes | $95.990/mes |
| `STUDIO` | 400 | $189.990 | $185.990/mes | $181.990/mes |
| `ENTERPRISE` | ilimitado | a convenir | — | — |

Regla: ≈8.5% de facturación para la academia típica del piso de cada
banda; al tope el % efectivo cae (descuento por volumen implícito).
Precios en `PlatformParam` (`academy_tier.starter_monthly_clp`, etc.).

### Producer Pro

Tier por facturación mensual de ventas (media últimos 90 días).
Objetivo ~10% de facturación para el productor del piso de la banda;
igual que academias, el % efectivo cae al tope:

| Tier | Facturación mensual | Mensual | Semestral (−2%) | Anual (−4%) |
|---|---|---|---|---|
| `PRO_STARTER` | ≤$2,5M | $99.990 | $97.990/mes | $95.990/mes |
| `PRO_GROWTH` | ≤$8M | $249.990 | $244.990/mes | $239.990/mes |
| `PRO_BIG` | >$8M | a convenir | — | — |

Medidor: `SUM(payments brutos del productor en 90d)/3`. Enforcement
suave: exceder el límite marca "upgrade requerido" para la próxima
renovación — nunca corta la operación ni las features en curso.
Precios en `PlatformParam` (`producer_tier.*_monthly_clp`).

Nota de take total: el Pro se suma al `platformFeePct` por venta —
un productor Starter con 8% comisión + Pro queda ~12-14% de take.
Registrado como punto de revisión comercial antes del lanzamiento.

"Alumnos activos" = `Enrollment` en `ACTIVE|TRIAL|ONLINE` de esa
academia (misma definición que usa el CRM).

## Modelo de datos (implementado en S1)

- Catálogo de tiers **sin tabla propia**: enums `AcademyTier`,
  `BillingCycle`, `ProducerProTier`, `PlatformSubKind` + precios/límites en
  `PlatformParam` (`academy_tier.*`, `producer_tier.*`, `academy_billing.*`)
  — editables en /admin sin migración. ~~`AcademyPlan` model~~ descartado:
  una tabla duplicaría lo que params ya resuelve (4 tiers, sin admin UI de
  catálogo propio).
- `PlatformSubscription` (nuevo): suscripción DE la plataforma — `kind`
  ACADEMY|PRODUCER, `academyId`/`producerId`/`personId` (quien paga),
  `tierCode`, `billingCycle`, `flowSubscriptionId`, mismo ciclo de vida
  `PENDING_CARD → … → CANCELED` que `MembershipSubscription` (motor Flow
  compartido). Distinto del legado `AcademySubscription` (sin uso).
- `Academy`: `tier`, `billingCycle`, `billingGraceUntil`,
  `billingBlockedAt`, `trialEndsAt`.
- `Person.proTier` (`FREE` default) — no hay tabla `Producer`: producerId
  en todo el schema es personId del rol PRODUCER (`EventSeries.producerId`,
  `ProducerParams.producerId`). `PlatformSubscription.producer → Person`.

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

- `proTier` ≠ `FREE` habilita: analítica avanzada, CRM, exports,
  gestión de staff/listas — el gating exacto se fija en los specs;
  el ticketing base (publicar, vender, check-in) queda FREE siempre.
- Suscripción con tier según facturación (params `producer_tier.*` ya
  sembrados: starter 99.990 / growth 249.990 mensual). Mismo motor
  Flow que `MembershipSubscription` (vía `PlatformSubscription`).
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
