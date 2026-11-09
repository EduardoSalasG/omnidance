# Handoff: trial-lifecycle-15d - continuación 3 (task 5b)

Sesión 2026-11-09 (noche). Continuación de
`next-session-handoff-trial-lifecycle-2.md`. Commit en `dev`:

- `81a0e08a` emisiones `ActivityEvent` del ciclo de vida (5b parcial).

## Hecho en `81a0e08a` (tsc api verde)

- `common/activity-log.ts`: `emitActivity` acepta `at` (createdAt del
  hecho, default now) + `emitActivityOnce` (dedup por
  `(type,refType,refId)` - misma llave que el backfill).
- `common/platform-trials.ts`: `emitTrialEnded` - dedup por
  `data.endsAt` (path JSON), outcome `expired|converted` según
  `endsAt <= now`; devuelve `{id, created}`.
- `platform-subscriptions.service.ts`: `billing.blocked` en
  `enforceAcademyBlocks` (updateMany+evento en misma tx); `trial.ended`
  conversión en `applyEntitlement` (lee tier/trialEndsAt previo);
  `sub.started` una vez en `notifyStarted` (dedup refId=sub.id);
  `sub.canceled` en `cancelSub` (manual CANCELED + remoto
  CANCEL_PENDING) y en `becameCanceled` del reconcile (emitActivityOnce
  cubre cancel remota externa); `sub.plan_changed` en `swapPlanNow` y
  `applyPendingPlanChange` (data.from/to).
- `payment-settlement.service.ts`: `payment.paid` en
  `emitSettleEvents` (todos los orderTypes, dentro de la tx);
  `sub.started`/`sub.renewed` en `settlePlatformSub` por `priorPaid`
  (count PAID `platsub_<sub.id>_*`); `trial.ended` conversión TRANSFER
  cuando `sub.status === "PENDING_PAYMENT"`;
  `enrollment.started` en los 2 `tx.enrollment.create` de
  settleMembership (TRIAL + regular).
- `trial-lifecycle.service.ts`: `sweepTrialEnded(now)` - academias
  `tier null` + `trialEndsAt <= now` y personas `proTier FREE` +
  `proTrialEndsAt <= now`, emite `trial.ended` expired con `at`=endsAt;
  cableado en `subscriptions.scheduler` tras `sweepTrialLastDay`
  (`trialsEnded` en meta del job).
- `admin.controller.ts`: `role.approved` en `approveQueueItem` (tx);
  `role.requested`/`role.approved` en `setRole` (create PENDING /
  transición a APPROVED).
- `prisma-auth.repo.ts`: `registerPerson` privado -
  `person.registered` + `role.approved` por rol auto-aprobado (DANCER)
  en `upsertByEmail` create y `createWithPassword` (via
  `auth.magic-link`/`auth.register`); `ensurePendingRole` reescrito a
  findUnique+create (P2002 = carrera, no emite) y emite
  `role.requested`.

## Falta para cerrar 5b (emisiones restantes)

- `person.registered` en los `person.create` restantes (stubs/light):
  `academies.controller.ts:1868` (alumno stub),
  `academy-import.service.ts:139/147` (importación masiva),
  `academy-staff.controller.ts:655` (resolvePerson staff/instructor),
  `admin.controller.ts:1031` (lead→person, tiene roles APPROVED
  anidados - emitir también `role.approved` por cada uno; hace falta
  `include: { roles: { select: { id: true, role: true } } }` o fetch),
  `prisma-checkins.repo.ts:291` (`createLightPerson`, roles anidados),
  `producer.controller.ts:416`, `leads.controller.ts:250` (roles
  anidados). Sin estos, el backfill emitiría `person.registered` para
  stubs históricos pero el runtime no lo emitiría para los nuevos.
- `enrollment.started` en: `academies.controller.ts:1913` (alta
  staff), `academy-claims.service.ts:1041` (claim aprobado, dentro de
  tx), `academy-import.service.ts:168` (importación).
- `schema.prisma` comentario del campo `ActivityEvent.type`: agregar
  `sub.plan_changed` a la lista (se emite nuevo, el comentario quedó
  desactualizado).
- `GET /admin/users/:id/timeline` en `user-intel.controller.ts`
  (`@Get("users/:personId/timeline")`, guard ya es admin.access):
  `activityEvent.findMany({ where: { personId }, orderBy: { createdAt:
  "desc" }, take: ~50 })` → `{items: [{at,type,label,refType,refId}]}`.
  Label: server-side en español (consistente con títulos de
  Notification que ya son es server-side). Tipos posibles:
  person.registered, role.requested/approved, trial.started/ending/
  ended/adjusted, sub.started/renewed/canceled/plan_changed,
  access.ended, billing.blocked, enrollment.started, payment.paid
  (+ invite.* del change academy-invites futuro).
- Sección línea de vida en `admin/usuarios/[personId]/page.tsx`:
  fetch paralelo al detail, lista desc icono+label+fecha, preview ~8 +
  SeeAllRow si crece. i18n en `parts/admin.json` + `parts/<loc>/
  admin.json` (4 locales).
- Backfill one-shot `apps/api/scripts/backfill-activity-events.cjs`
  (patrón `backfill-churn-entitlements.cjs`, dry-run default +
  `--apply`): derivar historia → person.registered (Person.createdAt),
  role.requested (PersonRole.createdAt), role.approved (AuditLog
  ROLE_APPROVE/ROLE_SET o createdAt si APPROVED sin audit),
  trial.started (Academy.createdAt / proTrialEndsAt−15d), trial.ending
  (trialEndNotifiedAt), trial.ended (trialEndsAt vencida),
  sub.started/canceled (createdAt/canceledAt), sub.renewed (PAID
  PLATFORM_SUB después del primero), billing.blocked
  (billingBlockedAt), enrollment.started (Enrollment.startedAt),
  payment.paid (Payment PAID). Dedup (refType,refId,type) antes de
  insertar; refId = id de la entidad (payment.id, enrollment.id,
  personRole.id, sub.id, academy/person id para trial.*).
- Tests pedidos en tasks.md: owner ciclo completo (orden del
  timeline), dancer sin platsub, dedup del backfill. Patrón fake
  prisma `matchWhere` (ver `platform-trials.spec.ts`,
  `trial-lifecycle.service.spec.ts`).

## Resto del change (después de 5b)

- Task 7 frontend corte: `GET /academies/mine` ya corta en backend;
  AcademyTierGate/nav con features vacías → solo Inicio/Suscripción/
  Perfil + aviso en Inicio con CTA a Suscripción + i18n.
- class-card-projection: `billingBlocked` no incluye trialExpired -
  decidir si el card muestra el mismo "no disponible".
- Task 8 gates/docs: `openspec validate --changes`, archivar SIN
  `--skip-specs`, omni-dance.md, qa-flows-inventory, architecture.md,
  flows.md, export-api-docs.cjs, typecheck/lint/tests.
- academy-invites (change separado, todo pendiente).
- Hallazgos de importación masiva de alumnos del usuario (handoff
  anterior, fuera del change).

## Verificación de la sesión

- `npx tsc --noEmit` en apps/api: 0 errores (output `TSC_DONE`).
- Sin tests nuevos aún - el commit es emisiones sin spec; los specs
  pedidos quedan en la lista de arriba.

## Notas operativas

- Git no está en PATH del shell MSYS: `export
  PATH="/c/Program Files/Git/cmd:$PATH"`.
- Prisma JSON filter usado para dedup: `data: { path: ["endsAt"],
  equals: iso }` compila OK en este proyecto.
