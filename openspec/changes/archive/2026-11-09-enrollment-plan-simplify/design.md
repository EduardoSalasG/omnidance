# Design: modelo binario de inscripción + plan como "pack con vigencia"

## Modelo resultante

- `EnrollmentStatus` = `ACTIVE | INACTIVE`. Semántica única: ACTIVE
  habilita reserva, cuenta como alumno vigente (KPIs, billing SaaS,
  home, claims) y es "mía" en /clases. INACTIVE no.
- `PlanType` = **regla de vigencia** (no de cuota): MONTHLY/QUARTERLY/
  SEMIANNUAL/SINGLE/CLASS_PACK/PERIOD. La cuota vive en
  `weeklyClasses` (por semana ISO, cualquier tipo) y `classCount`
  (total por ciclo pagado, cualquier tipo).
- "Clase de prueba" = `CLASS_PACK` con `classCount` (normalmente 1) y
  `price` 0 (staff) o >0 (vendible). Sin tipo propio.

## Migración (una sola, `pnpm db:migrate`)

- `Enrollment`: `status` TRIAL/ONLINE→ACTIVE, PAUSED/FROZEN→INACTIVE.
  Postgres enum no deja borrar valores in-place: crear enum nuevo,
  alter column, drop viejo (patrón estándar de migración Prisma).
- `MembershipPlan`: `type` TRIAL→CLASS_PACK y `classCount = 1` para
  esos planes (la prueba es 1 clase; `null` la dejaría ilimitada —
  contradice la regla confirmada por el owner).
- `Enrollment.pausedAt`: queda sin uso → drop en la misma migración
  (verificar que ninguna superficie lo lea; si alguna lo muestra,
  conservar la columna y dejarla morir).
- No hay backfill de motivo: decisión explícita del owner.

## Vigencia rodante (`membership-vigency.ts`)

- `membershipEndsAt` pasa de calendario a duración: MONTHLY `addMonths
  (base,1)`, QUARTERLY +3, SEMIANNUAL +6, PERIOD `base + periodDays`,
  SINGLE `base + 1 día`, CLASS_PACK `null`. `addMonths` con clamp
  (31 ene + 1 → 28/29 feb). Se conserva la convención mediodía CL
  (~15:00 UTC) solo para SINGLE si hace falta TZ; para duración la
  fecha es absoluta.
- `membershipBase`: en rodante la extensión suma sobre el `endsAt`
  pagado (renovar no come días; hoy suma endsAt+1día por semántica
  calendario — re-evaluar: con rodante, `endsAt` ya es el límite del
  período pagado, extender desde `endsAt` directo es lo correcto).
- `RECURRING_PLAN_TYPES` se mantiene (MONTHLY/QUARTERLY/SEMIANNUAL
  suscribibles por Flow — ahora alineados con el cobro por aniversario).
- Staff alta (`POST /academies/:id/enrollments`): `endsAt` pasa de
  opcional-manual a **autocomputado** `startedAt + duración(plan)`
  cuando el tipo lo define; `dto.endsAt` explícito sigue ganando
  (mes calendario a mano sigue posible). CLASS_PACK → null.

## Cuota por ciclo pagado (`classes.controller.ts`)

- `BOOKABLE_ENROLLMENT` → `["ACTIVE"]` (constante posiblemente se
  simplifica a un único status).
- `resolveQuota`: la regla de conteo pasa de
  `plan.type === "CLASS_PACK" && plan.classCount != null` a
  `plan.classCount != null`. La ventana de conteo deja de ser
  `{gte: e.startedAt}` fija y pasa a **ciclo vigente**:
  `gte = e.endsAt != null ? max(e.startedAt, endsAt − duración(plan)) :
  e.startedAt`. `duración` por tipo (1/3/6 meses, periodDays); para
  CLASS_PACK (endsAt null) queda `startedAt` — mismo comportamiento.
  Por qué funciona: al renovar, `endsAt_nuevo = endsAt_viejo + duración`
  → `endsAt − duración` = inicio del ciclo recién pagado. En vuelta de
  mora, `endsAt = now + duración` → ciclo parte en `now`.
- El mismo ajuste en `myQuota` (l.~764, misma condición duplicada) y
  en lo que derive `myCredits` (sale de `resolveQuota`, automático).
- Copy de 409: PACK sigue igual ("Agotaste la(s) clase(s) de tu pack")
  — un MONTHLY con classCount agotado dice pack; si se quiere
  distinguir, evaluar copy por `plan.type` (nice-to-have, no bloquea).

## Estados y superficies

- `ENROLLMENT_TRANSITIONS` colapsa a `ACTIVE ↔ INACTIVE`;
  `assertEnrollmentTransition` se trivializa (mismo-status permitido,
  el resto permitido) — evaluar si la función/errores dedicados siguen
  teniendo sentido o se eliminan.
- Todas las listas `["ACTIVE","TRIAL","ONLINE"]` → `["ACTIVE"]`
  (classes controller ~6 sitios, academies.controller ~4, home.service,
  user-intel, platform-subscriptions `countActiveStudents`,
  private-lessons, academy-claims `[... ,"PAUSED","FROZEN"]` →
  `["ACTIVE","INACTIVE"]` o sin filtro).
- `computeDashboard` → `studentsByStatus {active, inactive}`.
- students-section: badge TRIAL:outline y variantes por status →
  activo/inactivo; el filtro del listado se simplifica.
- `academy-reminders.service`: hoy excluye TRIAL por status; pasa a
  filtrar **por tipo de plan** — solo MONTHLY/QUARTERLY/SEMIANNUAL/
  PERIOD generan "renueva tu plan" (packs/prueba no renuevan).
- `academy-import.service`: estados importables = active/inactive.
- i18n (`planTypeLabels`, status labels): sacar TRIAL; agregar INACTIVE.
- settlement (`payment-settlement.service.ts` l.~889): eliminar la rama
  TRIAL (fila aparte); la compra de CLASS_PACK cae en el flujo normal.
- checkout: `plan.type === "TRIAL" && price <= 0` → `price <= 0`
  (cualquier tipo gratis no se vende online).
- profile-plans-section: `freeTrial` → `price <= 0` genérico.
- CRM: eliminar trigger `TRIAL_EXPIRING` (tipo + form + i18n + tests).
- Seed (`seed-dev.ts`): 5 planes "Clase de prueba" → `CLASS_PACK` con
  `classCount: 1`; el `db:enrich` y personas QA que dependan de status
  TRIAL, ajustar.

## Specs delta (archivo en specs/)

- `academies/class-credits` MODIFIED: `classCount` aplica a cualquier
  tipo; la ventana de consumo es el ciclo pagado vigente; bookable
  solo ACTIVE.
- `academies/renewal` MODIFIED: gracia/recordatorio sin TRIAL.
- `checkout` MODIFIED: sin TRIAL; price≤0 no vendible.
- `payments` MODIFIED: `membershipEndsAt` rodante.
- Nuevo `academies/enrollment-model` (o dentro de una existente):
  estados binarios y transiciones.
- `crm` triggers: REMOVED `TRIAL_EXPIRING`.

## Riesgos

- Datos existentes con TRIAL/PAUSED/FROZEN/ONLINE: el mapeo preserva
  su capacidad efectiva (bookable/no-bookable) — validado contra el
  uso real (solo ACTIVE mueve volumen en dev).
- `endsAt` existentes quedan con su fecha absoluta (no se re-escribe);
  la próxima renovación ya calcula rodante — transición limpia.
- Incentivo a manual: los claims MANUAL siguen exentos de fee (eso se
  decide en `academy-byo-collections`, no aquí).
