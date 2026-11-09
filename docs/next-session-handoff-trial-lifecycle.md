# Handoff: trial-lifecycle-15d + academy-invites

Sesión de diseño completada 2026-11-09. Dos changes OpenSpec
diseñados, validados (`openspec validate --changes` verde) y
commiteados. **Implementación en curso**: el slice de datos +
corte dancer ya está commiteado (`f9616e7a`).

## Implementado (commit f9616e7a)

- Migración `20261109000000_trial_lifecycle_activity`: tabla
  `ActivityEvent` + `Academy.trialEndNotifiedAt` +
  `Person.proTrialEndNotifiedAt` (aplicada con migrate deploy).
- `common/activity-log.ts` → `emitActivity` (firma tx).
- Params seed: `academy_billing.trial_days` 30→15,
  `producer_pro.trial_days` 15, `cx.contact.*`, `cx.notify_email`.
- `academy-tiers.ts`: `academyInTrial`, `academyTrialExpired`,
  `featuresForAcademy`; `assertAcademyFeature` ahora exige
  `trialEndsAt` (callers: actor-entitlements ×2, private-lessons,
  academy-sales). 15 tests verdes.
- Delisting dancer: `directory`, `publicDirectory`, listado de
  clases y sugerencia de home excluyen academias sin acceso
  (`OR: tier not null | trialEndsAt > now`); booking y checkout de
  membresía rechazan con `academy.unavailable`/`AcademyUnavailableError`.
- `pnpm exec tsc --noEmit` en apps/api verde.

## Pendiente (tasks del change, en orden)

- Otorgamiento: `proTrialEndsAt` al aprobar PersonRole(PRODUCER)
  (admin.controller `approveQueueItem` + grant directo ~L880) +
  ActivityEvent + welcome.
- Correos: bienvenida (todos los tiers, plan en prueba, contacto CX)
  + ficha a `cx.notify_email`; barrido último día en
  `subscriptions.reconcile` (ventana 24h, dedup columnas) + promo
  `trial-conv-<YYYYMMDD>` 50%/maxCycles 1/whitelist/fin de día.
- Churn: en `reconcileSubscription` CANCELED definitivo limpiar
  `Academy.tier`/`billingCycle` y `Person.proTier` + notify
  `*.access_ended` + ActivityEvent; backfill one-shot de entitlements.
- Admin: KPIs en `/home/stats` lente ADMIN; `GET /admin/trials`;
  `GET /admin/users/:id/timeline` (lee ActivityEvent); PATCH
  `/admin/academies/:id/trial` y `/admin/users/:id/pro-trial`
  (audit + `trial.adjusted`); sección en `/admin/usuarios/[id]`.
- Card CX en `/perfil` (ACADEMY_OWNER/PRODUCER, params cx.contact.*).
- Front corte: consola con features vacías (nav/hub solo
  Inicio/Suscripción/Perfil + aviso en Inicio) - el backend ya corta;
  falta que `GET /academies/mine` exponga el estado para que
  AcademyTierGate/nav reflejen features vacías.
- class-card-projection: flag `billingBlocked` hoy no incluye
  trialExpired (los bookings propios siguen listándose - decidir si
  el card muestra el mismo "no disponible").
- academy-invites (change separado, todo pendiente; depende de
  ActivityEvent).
- Gates finales: archivar changes, docs (omni-dance.md,
  qa-flows-inventory, architecture, flows, openapi/postman),
  typecheck/lint/tests.

## Estado del repo

- `openspec/changes/trial-lifecycle-15d/`: proposal, specs
  (platform-trials nuevo + deltas academy-billing, admin,
  admin/home-insights), design, tasks. Commits `cabe` y `fda0d430`.
- `openspec/changes/academy-invites/`: proposal, specs
  (academies/student-invites nuevo + delta auth/email-otp), design,
  tasks. Mismo commit inicial.
- Working tree limpio tras los commits de openspec.

## Decisiones clave ya tomadas (no re-discutir)

- Trial 15d ambos actores: academia por param
  `academy_billing.trial_days` (era 30, seed cambia a 15) al crear la
  academia; productor `proTrialEndsAt` al aprobar `PersonRole(PRODUCER)`
  con param `producer_pro.trial_days` = 15, nivel PRO_STARTER.
- Corte unificado: `tier==null && trialEndsAt<=now` → features vacías
  (consola solo Inicio/Suscripción/Perfil, deslistada del dancer,
  bookings/checkout rechazan). Suscripción/billing nunca se gatean.
- Churn: en CANCELED definitivo (sin swap/reprice) limpiar
  `Academy.tier`/`billingCycle` y `Person.proTier` si no hay otra sub
  viva + notificación `*.access_ended`. Bug hallado: tier nunca se
  limpiaba → churned conservaba acceso. Backfill one-shot en el
  migration plan (de una vía, revisar lista de afectados antes).
- Correos: bienvenida (todos los tiers, plan en prueba marcado,
  contacto CX) + ficha a `cx.notify_email`; último día en barrido del
  job `subscriptions.reconcile` (ventana 24h, dedup en columnas
  `trialEndNotifiedAt`/`proTrialEndNotifiedAt`) + promo diaria
  `trial-conv-<YYYYMMDD>` percentOff 50 maxCycles 1 whitelist actor,
  válida solo ese día ("suscríbete hoy").
- Admin: KPIs trials en `/home/stats` lente ADMIN + `GET /admin/trials`;
  `GET /admin/users/:id/timeline` leyendo `ActivityEvent` nueva tabla
  append-only + backfill derivado; PATCH trialEndsAt/proTrialEndsAt
  (audit + `trial.adjusted`).
- CX: card en `/perfil` para ACADEMY_OWNER/PRODUCER desde params
  `cx.contact.*` (Eduardo Salas, eduardo@omnidance.tech, +56982439041).
- Invites academia: `AcademyInvite` sin enrollment, `AuthOtp.next`
  (path interno validado), push a cuentas existentes, Referral +
  ActivityEvent al consumir. UI: acción "Invitar" en /academia/alumnos.
- Descartado: descuento automático a los 30 min del trial (decisión
  del usuario: solo en correo de último día).

## Próximos pasos

1. Ejecutar tasks.md de `trial-lifecycle-15d` (bloques 1-8). Orden
   sugerido: migración+params → corte/features → correos+barrido →
   churn → admin panel+timeline+PATCH → card CX → front corte → docs.
2. `academy-invites` depende de `ActivityEvent` (emitir solo si la
   tabla existe).
3. Gates al terminar: `openspec validate`, archivar changes sin
   `--skip-specs`, `qa-flows-inventory.md`, `omni-dance.md` (Trial
   30d→15d, churn, invites), export-api-docs, typecheck/lint/tests.

## Gaps conocidos / pendientes fuera de scope

- Mora de productor no degrada `proTier` (comentario explícito en
  código; decisión de producto pendiente).
- Trial-expired conserva cobranza por endpoints no gated (aceptado en
  design: billing/suscripción son la salida).
- Organigrama de equipo real: hoy CX = params apuntando a Eduardo.
