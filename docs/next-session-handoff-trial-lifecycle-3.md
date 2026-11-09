# Handoff: trial-lifecycle-15d - continuación 3 (task 5b)

Sesión 2026-11-09 (noche). Continuación de
`next-session-handoff-trial-lifecycle-2.md`. Commits en `dev`:

- `81a0e08a` emisiones `ActivityEvent` del ciclo de vida (5b parcial).
- `fd25d1ef` este handoff.
- `596735ec` `person.registered` + `enrollment.started` en altas
  no-auth (academias, claims, import, staff, checkins, producer,
  leads, admin lead-convert) + comentario de tipos en schema.prisma
  (`sub.plan_changed`).
- `fb315469` `GET /admin/users/:personId/timeline` en
  `user-intel.controller.ts` - una query `personId`, desc, take 100,
  items `{id, at, type, label, ref?}` con label server-side es-CL
  (helper `timelineLabel` al pie del archivo).
- `769b51e8` sección línea de vida en
  `admin/usuarios/[personId]/page.tsx`: fetch independiente del
  detail, lista desc con preview de 5 + `SeeAllRow`, `SkeletonList`
  de carga, estado vacío, chip con el tipo. i18n
  `admin.users.detail.timeline.{title,empty}` en los 4 locales.

Emisiones ya completas (todas las de la lista tasks.md 5b +
`sub.plan_changed`): trial.started/ending/ended/adjusted,
access.ended, sub.started/renewed/canceled/plan_changed,
role.requested/approved, person.registered, billing.blocked,
enrollment.started, payment.paid. `trial.ended` quedó resuelto así:
emite `emitTrialEnded` (common/platform-trials.ts) en la conversión
(`applyEntitlement` CARD + alta TRANSFER en `settlePlatformSub`) y en
`sweepTrialEnded` (job diario, outcome expired, `at`=trialEndsAt);
dedup por `data.endsAt` para que un trial re-extendido emita de nuevo.

## Falta para cerrar 5b

- Backfill one-shot `apps/api/scripts/backfill-activity-events.cjs`
  (patrón `backfill-churn-entitlements.cjs`: dry-run default +
  `--apply`, idempotente). Derivación sugerida:
  person.registered ← Person.createdAt; role.requested ←
  PersonRole.createdAt; role.approved ← AuditLog ROLE_APPROVE/ROLE_SET
  (o PersonRole.createdAt si APPROVED sin audit); trial.started ←
  Academy.createdAt / proTrialEndsAt - producer_pro.trial_days;
  trial.ending ← trialEndNotifiedAt/proTrialEndNotifiedAt;
  trial.ended ← trialEndsAt vencida (dedup `data.endsAt` como
  `emitTrialEnded`); trial.adjusted ← AuditLog TRIAL_SET;
  sub.started/canceled ← createdAt/canceledAt; sub.renewed ← PAID
  PLATFORM_SUB posteriores al primero; billing.blocked ←
  billingBlockedAt; enrollment.started ← Enrollment.startedAt;
  payment.paid ← Payment PAID (gatewayPaidAt ?? createdAt). Dedup
  `(type,refType,refId)` antes de insertar.
- Tests pedidos en tasks.md: owner ciclo completo (orden del
  timeline), dancer sin platsub, dedup del backfill. Patrón
  fake-prisma en `platform-trials.spec.ts` /
  `trial-lifecycle.service.spec.ts` (matchWhere reducido:
  equality/null/in/gt/lte/OR; `$transaction` = `fn(prisma)`).
- `openspec validate --changes` al final junto a task 8.

## Resto del change (después de 5b)

- Task 7 frontend corte: `GET /academies/mine` ya corta en backend;
  AcademyTierGate/nav con features vacías → solo
  Inicio/Suscripción/Perfil + aviso en Inicio con CTA a Suscripción +
  i18n.
- class-card-projection: `billingBlocked` no incluye trialExpired -
  decidir si el card muestra el mismo "no disponible" (design.md lo
  recomienda).
- Task 8 gates/docs: `openspec validate --changes`, archivar SIN
  `--skip-specs`, omni-dance.md, qa-flows-inventory, architecture.md,
  flows.md, export-api-docs.cjs, typecheck/lint/tests.
- academy-invites (change separado, todo pendiente).
- Hallazgos de importación masiva de alumnos (handoff anterior,
  fuera del change).

## Verificación de la sesión

- `npx tsc --noEmit` apps/api: 0 errores tras cada lote.
- `npx tsc --noEmit` apps/web: 0 errores tras la sección timeline.
- `npx impeccable detect --json` sobre la ficha: `[]`.
- Sin specs nuevos aún: las emisiones no tienen cobertura de test -
  los specs de la lista de arriba son el gate.

## Notas operativas

- Git no está en PATH del shell MSYS: `export
  PATH="/c/Program Files/Git/cmd:$PATH"`.
- Prisma JSON filter usado para dedup: `data: { path: ["endsAt"],
  equals: iso }` compila OK.
- `emitActivityOnce` (common/activity-log.ts) dedup por
  (type,refType,refId); `emitTrialEnded` devuelve `{id, created}`
  para conteo del barrido.
- Labels del timeline son server-side es-CL (mismo criterio que
  títulos de Notification); el chip de tipo muestra `ev.type` crudo.

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
