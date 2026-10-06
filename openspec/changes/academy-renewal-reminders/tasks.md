# Tasks - academy-renewal-reminders

- [x] `schema.prisma`: `Enrollment.reminderExpiringFor` +
  `reminderExpiredFor` (`DateTime?`) + migración manual aplicada con
  `migrate deploy`.
- [x] `auth/infrastructure/emails.ts`: exportar `emailShell`,
  `ctaButton`, `fallbackLink` (sin romper las plantillas actuales).
- [x] `academies/infrastructure/renewal-emails.ts`: plantillas
  `renewalExpiringEmailHtml` + `renewalGraceEmailHtml` con el shell de
  marca.
- [x] `academies/infrastructure/academy-reminders.service.ts`:
  `runDaily(now)` - selecciona expirings (ACTIVE/ONLINE, `endsAt` en
  ventana, marcador distinto) y gracias (`endsAt` vencido dentro de
  grace), envía mail + notifySafe + marca el campo del ciclo.
  Params: `academy.renewal.first_notice_days` (5) y
  `academy.renewal.grace_days` (5).
- [x] `academies/infrastructure/academies.scheduler.ts`: node-cron
  `0 9 * * *` -> `runDaily()` (skip en NODE_ENV=test) + wiring en
  `academies.module.ts`.
- [x] `resolveQuota` en `classes.controller.ts`: regla de vigencia
  efectiva con `grace_days` (endsAt vencido -> solo clases <=
  endsAt+grace) - select agrega `endsAt`.
- [x] `settleMembership`: notifySafe a `academy.ownerId` (alumno + plan
  + monto) en el bloque `paidNow`.
- [x] `seed-common.ts`: params `academy.renewal.*` con defaults.
- [x] Tests: spec del reminders service (ventanas, dedup, exclusiones,
  TRIAL omitido), spec de resolveQuota (vigente/en gracia/fuera), spec
  de settle (owner notificado), e2e del sweep.
- [x] Docs: `docs/flows.md` (flujo recordatorio + vigencia efectiva) +
  `docs/architecture.md` (nota scheduler/param).
- [x] Verificación: tests API, i18n/build si toca web, openspec
  validate.
