# Handoff: trial-lifecycle-15d - continuación 2

Sesión 2026-11-09 (tarde). Continuación de
`next-session-handoff-trial-lifecycle.md`. Commits en `dev`:

- `d0aff848` tests del barrido `trial-lifecycle.service.spec.ts`
  (7 tests: ventana (now, now+24h] con borde lte, dedup, promo diaria
  reutilizada por día CL con validUntil fin de día Santiago, whitelist
  por actor, convertidos excluidos, ActivityEvent trial.ending, actor
  sin email). Mutación lte→lt verificada sensible.
- `f4af5505` tasks 4b + 5 completas:
  - `PATCH /admin/academies/:id/trial` y `PATCH
    /admin/users/:id/pro-trial` en `AdminController` (admin.access):
    fija fecha, **resetea `trialEndNotifiedAt`/`proTrialEndNotifiedAt`
    a null** (la fecha nueva merece su propio correo de último día),
    audit `TRIAL_SET` + `trial.adjusted` en la misma tx. DTO
    `{endsAt: ISO8601}`.
  - `common/platform-trials.ts` `listPlatformTrials(prisma, now)`:
    fuente única del panel. En trial = academia `tier null` +
    `trialEndsAt` set / persona `proTier FREE` + `proTrialEndsAt` set.
    EXPIRED exige sin sub viva (PLATFORM_SUB_LIVE_STATUSES); con trial
    vigente se lista aunque haya PENDING_CARD (sigue siendo trial).
    Rows: `{kind,id,name,email,role,tier,trialEndsAt,daysLeft,state}`.
    `spec` en `common/platform-trials.spec.ts` (10 tests).
  - `GET /admin/trials` → `{items}`; KPIs `trialsActive` (ACTIVE +
    EXPIRING), `trialsExpiring` (≤7d), `trialsExpired` + preview
    `trials:{count,items:8}` en `adminStats` de `HomeService` -
    spec admin/home-insights del change.
  - `TrialDateEditor` (`components/admin/trial-date-editor.tsx`):
    date + "Ajustar" → input date + guardar/cancelar. El día elegido se
    envía como fin de ese día en Santiago (≈04:00 UTC del día
    siguiente, mismo criterio `clEndOfDay` del barrido). Montado en:
    ficha `/admin/academias/[id]/suscripcion` (fila Trial del dl),
    ficha `/admin/usuarios/[personId]` (fila Trial Producer Pro,
    visible si `proTrialEndsAt` o rol PRODUCER), y cada fila del panel
    de trials del inicio admin.
  - Panel en `HomeHub`: grupo KPI `cats.trials` + sección filas
    (urgencia primero, badge estado, días, navega a
    `/admin/academias/:id` o `/admin/usuarios/:id`) - solo si hay
    activos/por vencer (spec). `ActionNotice` post-ajuste +
    `setStatsRetry` refetch.
  - `user-intel detail` expone `proTier`/`proTrialEndsAt`.
- `663b29dd` task 6: `/me` devuelve `cx {name,email,phone}` (params
  `cx.contact.*`) solo si el usuario tiene rol ACADEMY_OWNER/PRODUCER
  (APPROVED o PENDING). Decisión: NUNCA en `/params/public` (es sin
  sesión - datos personales). Card en `/perfil` (mailto + wa.me).
  `MeContextData.cx`, spec de PeopleController con stub ParamsService.

## Pendiente (tasks del change, en orden)

- **5b. Línea de vida** (el task más grande que queda):
  - Emisiones `emitActivity` restantes: `trial.started` academia (en
    creación de academia - productor ya emite vía pro-trial.ts),
    `trial.ended`/`access.ended` (corte - el churn cut ya emite
    `access.ended`; falta `trial.ended` al cruzar vencimiento? decidir:
    el corte es lazy por featuresForAcademy, no hay evento físico al
    vencer - la línea de vida puede derivarlo de trialEndsAt o emitirlo
    en el backfill/delisting), `sub.started/renewed/canceled`
    (platform-subscriptions settle/cancel), `role.approved`
    (approveQueueItem + setRole), `person.registered` (auth signup),
    `billing.blocked` (grace→blocked), `enrollment.started`,
    `payment.paid` (settle).
  - Backfill one-shot `scripts/` derivado con dedup por
    (refType,refId,type) - patrón `backfill-churn-entitlements.cjs`
    (dry-run default, `--apply`).
  - `GET /admin/users/:id/timeline` → `{at,type,label,ref?}` desc
    (AdminController o user-intel).
  - Sección línea de vida en `/admin/usuarios/[id]` (icono/label por
    tipo, preview + SeeAllRow si crece).
  - Tests: owner ciclo completo, dancer sin platsub, backfill dedup.
- **7. Frontend corte**: `GET /academies/mine` debe exponer estado
  trial (ya corta en backend); AcademyTierGate/nav reflejen features
  vacías → nav/hub solo Inicio/Suscripción/Perfil + aviso en Inicio
  con CTA a Suscripción. i18n.
- **class-card-projection**: flag `billingBlocked` no incluye
  `trialExpired` - decidir si el card muestra el mismo "no disponible"
  (design sugiere misma postura que mora).
- **8. Gates/docs**: `openspec validate --changes`, archivar SIN
  `--skip-specs` (tiene deltas), `omni-dance.md` (15d, corte
  unificado, ActivityEvent, card CX, panel trials), qa-flows-inventory,
  architecture.md, flows.md (diagrama ciclo trial),
  `export-api-docs.cjs` (endpoints nuevos: PATCH trials, GET
  /admin/trials, /me.cx, timeline), typecheck/lint/tests.
- **academy-invites** (change separado, todo pendiente; la tabla
  ActivityEvent ya existe).
- **Foco pendiente del usuario** (fuera del change): hallazgos de
  importación masiva de alumnos en el handoff anterior
  (`enrollment.findFirst` sin status/orderBy, mediodía UTC vs CL,
  reintentar invitación no reenvía, spec bulk-import desactualizada,
  sin resumen/dry-run/EnrollmentLevel, teléfono solo nuevos, overlap
  con academy-invites, mailer inline).

## Verificación de la sesión (output real citado)

- `trial-lifecycle.service.spec`: 7/7 · `admin.controller.spec`: 6/6 ·
  `platform-trials.spec`: 10/10 · `people.controller.spec`: 55/55.
- `tsc --noEmit` api y web verdes · `i18n-audit.cjs` ALL_KEYS_OK ·
  `impeccable detect --json` → `[]` sobre el diff UI.
- i18n: claves en `messages/*.json` (home.kpi/cats/trialsTitle/
  trialsSummary) y `parts/admin.json` + `parts/<loc>/admin.json`
  (`admin.trials.*`, `users.detail.proTrial`) y `parts/profile.json`
  (`profile.cx.*`) - los 4 locales traducidos.

## Notas operativas

- Git no está en PATH del shell MSYS: `export
  PATH="/c/Program Files/Git/cmd:$PATH"`.
- Specs de controller: instanciación directa + `import
  "../../auth/infrastructure/auth.controller"` primero (rompe ciclo
  session.guard⇄auth.controller).
- Patrón fake prisma con `matchWhere` recortado por spec (eq/null/in/
  gt/lte/OR); `$transaction` = `fn(prisma)`.
