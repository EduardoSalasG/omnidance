# Handoff: trial-lifecycle-15d + academy-invites

Sesión 2026-11-09 (continuación). Dos changes OpenSpec diseñados y
validados. **Implementación avanzada** - commits en `dev`:

- `f9616e7a` schema ActivityEvent + corte por trial vencido (datos+corte
  dancer, sesión anterior).
- `7893bf7b` trial Producer Pro al aprobar `PersonRole(PRODUCER)`:
  `common/pro-trial.ts` `grantProducerTrialIfDue` (param
  `producer_pro.trial_days`, no reinicia trial vigente ni pisa sub viva),
  cableado en `approveQueueItem` y `setRole` (grant directo) +
  ActivityEvent `trial.started`. `PLATFORM_SUB_LIVE_STATUSES` ahora vive
  en `payments/domain/platform-tiers.ts`.
- `b18f60e3` corte unificado de churn: `applyChurnCut` en
  `platform-subscriptions.service` - sub CANCELED definitiva (reconcile
  remoto o cancel manual, sin swap/reprice) limpia `Academy.tier`/
  `billingCycle` y `Person.proTier`→FREE si no hay otra sub viva del
  actor; ActivityEvent `access.ended` + notifs
  `academy.access_ended`/`producer.pro_access_ended`. Backfill one-shot
  `scripts/backfill-churn-entitlements.cjs` (dry-run por defecto,
  `--apply` tras revisar lista - en dev lista 6 personas seed
  `CRM Producer*` con proTier sin sub: demo data, revisar antes).
- `312f8009` correos del ciclo de vida del trial + barrido (task 4).

## Implementado en el slice de correos (task 4)

- `payments/infrastructure/trial-emails.ts`: welcome academia/productor
  (todos los tiers con el en prueba marcado + contacto CX), último día
  con oferta 50%, ficha interna CX.
- `payments/application/trial-lifecycle.service.ts`:
  `sendAcademyTrialWelcome`/`sendProducerTrialWelcome` (+ ficha a
  `cx.notify_email`), `sweepTrialLastDay` (ventana 24h, dedup en
  `trialEndNotifiedAt`/`proTrialEndNotifiedAt`, solo `tier==null`/
  `proTier==FREE` - un convertido no recibe el aviso), promo diaria
  `trial-conv-<YYYYMMDD>` (PERCENT 50, maxCycles 1, validUntil fin del
  día CL ≈ UTC+4h) con whitelist por actor, ActivityEvent `trial.ending`.
- Wiring: `SubscriptionsScheduler` agrega `trials` al meta del job;
  creación de academia emite `trial.started` + welcome; approve/grant
  PRODUCER emiten welcome cuando el grant corre.
- Registrado en PaymentsModule providers+exports; specs arreglados
  (arg nuevo en AcademiesController/SubscriptionsScheduler).
- Verificado: `npx tsc --noEmit` verde; admin.e2e 24/24; scheduler spec
  3/3; platform-subscriptions spec 101/101; churn tests nuevos.

## Pendiente (tasks del change, en orden)

- Tests del barrido (`trial-lifecycle.service.spec.ts`): ventana 24h,
  dedup, promo reutilizada por día, convertido excluido, expiración.
  Task 4 lo pide y no está escrito.
- 4b. Ajuste admin de trial: `PATCH /admin/academies/:id/trial` y
  `/admin/users/:id/pro-trial` (audit + `trial.adjusted`) + UI en fichas.
- 5. Panel admin: KPIs en `/home/stats` lente ADMIN + `GET /admin/trials`
  + card/sección en inicio admin.
- 5b. Línea de vida: emisiones `emitActivity` restantes
  (role.approved, person.registered, billing.blocked,
  enrollment.started, payment.paid, sub.started/renewed/canceled),
  backfill derivado one-shot, `GET /admin/users/:id/timeline`, sección
  en `/admin/usuarios/[id]`.
- 6. Card CX en `/perfil` (ACADEMY_OWNER/PRODUCER, params cx.contact.*).
- 7. Front corte: `GET /academies/mine` debe exponer estado trial para
  que AcademyTierGate/nav reflejen features vacías (backend ya corta);
  nav/hub solo Inicio/Suscripción/Perfil + aviso.
- class-card-projection: flag `billingBlocked` no incluye trialExpired
  (decidir si el card muestra el mismo "no disponible").
- academy-invites (change separado, todo pendiente; depende de
  ActivityEvent - la tabla ya existe).
- Gates: archivar changes (sin --skip-specs), omni-dance.md,
  qa-flows-inventory, architecture, flows, openapi/postman,
  typecheck/lint/tests.

## Decisiones clave ya tomadas (no re-discutir)

- Trial 15d ambos actores por params (`academy_billing.trial_days`,
  `producer_pro.trial_days`); productor nivel PRO_STARTER.
- Corte unificado: `tier==null && trialEndsAt<=now` → features vacías.
  Suscripción/billing nunca se gatean. Churn limpia proyección y la
  misma regla cubre ambos cortes.
- Correos: bienvenida (todos los tiers marcados) + ficha CX al
  `cx.notify_email`; último día en el barrido de
  `subscriptions.reconcile` con promo diaria 50%/maxCycles 1.
- El trial de productor NO se otorga en lead-convert (demo accounts) -
  el design nombra solo approveQueueItem + grant directo.
- Invites academia (otro change): `AcademyInvite` sin enrollment,
  `AuthOtp.next`, push a existentes, Referral + ActivityEvent.

## Foco pendiente del usuario (fuera del change)

- Revisar/mejorar importación masiva de alumnos (ya auditada en la
  sesión anterior): hallazgos en el chat - `enrollment.findFirst` sin
  status/orderBy puede actualizar el enrollment equivocado;
  `pagado_hasta` usa mediodía UTC vs convención mediodía CL;
  "reintentar" invitación no reenvía; spec bulk-import desactualizada
  (respuesta `{results}` vs `{total,...}`); sin resumen ni dry-run;
  sin EnrollmentLevel; telefono solo en personas nuevas; overlap con
  academy-invites; latencia por mailer inline.
