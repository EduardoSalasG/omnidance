# Handoff: trial-lifecycle-15d + academy-invites (diseño aprobado, implementación pendiente)

Sesión de diseño completada 2026-11-09. Dos changes OpenSpec
diseñados, validados (`openspec validate --changes` verde) y
commiteados. **Nada de código implementado aún** - solo artefactos.

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
