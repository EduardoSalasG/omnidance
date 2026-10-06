# Proposal - academy-renewal-reminders

## Por qué

Las academias cobran mensualidades por fuera (transferencia, link de
pago, efectivo) o vía checkout Flow. Hoy `Enrollment.endsAt` es solo
informativo: el alumno cuyo plan venció sigue pudiendo agendar y nadie
le recuerda pagar. El owner tampoco se entera cuando un alumno paga su
plan online (el settle solo notifica al alumno).

## Qué cambia

- **Emails de renovación al alumno** (cron diario 09:00, mismo patrón
  `SubscriptionsScheduler`):
  - Aviso "por vencer": `endsAt` dentro de
    `academy.renewal.first_notice_days` (default 5d).
  - Aviso "en gracia": `endsAt` vencido dentro de
    `academy.renewal.grace_days` (default 5d) - le dice hasta qué fecha
    puede pagar antes de perder la reserva.
  - Solo inscripciones ACTIVE/ONLINE con `endsAt` (planes pagados);
    TRIAL, PAUSED, FROZEN y `endsAt` null no reciben avisos.
  - Dedup por ciclo: `Enrollment.reminderExpiringFor` /
    `reminderExpiredFor` guardan el `endsAt` avisado - una renovación
    (nuevo endsAt) rearma los avisos. Cada mail también deja
    notificación in-app.
- **Enforcement de vigencia en reservas**: `resolveQuota` excluye la
  inscripción cuyo `endsAt` pasó si la clase cae fuera de la ventana de
  gracia (`endsAt + grace_days`). Vigente -> agenda libre (comportamiento
  actual). En gracia -> solo clases dentro de la ventana. Fuera de
  gracia -> `no_enrollment` (403). Aplica también a TRIAL (vigencia es
  vigencia). `endsAt` null nunca expira.
- **Notificación al owner por pago de plan**: `settleMembership` avisa
  además a `academy.ownerId` (compra online y renovaciones de
  suscripción Flow pasan por el mismo settle).

## Archivos

- `schema.prisma`: 2 campos `DateTime?` en `Enrollment` + migración.
- `academies/infrastructure/academy-reminders.service.ts` (nuevo),
  `academies.scheduler.ts` (nuevo), `renewal-emails.ts` (nuevo);
  `auth/infrastructure/emails.ts` exporta el shell de marca.
- `classes.controller.ts` `resolveQuota` + `params`.
- `payment-settlement.service.ts` notifySafe al owner.
- `seed-common.ts`: params `academy.renewal.*`.
- Tests: spec del servicio de recordatorios, spec de quota con
  endsAt/gracia, spec de settle (owner notificado), e2e.
- Docs: `docs/flows.md`, `docs/architecture.md`.
