# Handoff: trial-lifecycle-15d - continuación 4 (cierre 5b + task 7)

Sesión 2026-11-09 (tarde). Continuación de
`next-session-handoff-trial-lifecycle-3.md`. Commits en `dev`:

- `8cab5e80` backfill ActivityEvent + fix `data.kind` en trial.started
  (cierra task 5b).
- `a87b26ef` corte frontend de academia con trial vencido (task 7).

## Estado del change

Todo el código de `tasks.md` está hecho: solo queda **task 8**
(gates/docs). `openspec validate --changes` ya da verde (3/3).

## Hecho en `8cab5e80`

- `apps/api/scripts/backfill-activity-events.cjs`: deriva la historia
  completa (person.registered, role.requested/approved, trial.started/
  ending/ended/adjusted, sub.started/renewed/canceled, billing.blocked,
  enrollment.started, payment.paid). Dry-run default + `--apply`;
  núcleo exportable (`planActivityBackfill`, `dedupKey`, `clDayKey`)
  para el spec. Dedup por llave natural por tipo: (type,refType,refId)
  como `emitActivityOnce`; scope actor para trial.started/ending;
  endsAt para trial.ended (como `emitTrialEnded`); refId+valor para
  trial.adjusted/billing.blocked. Sanea personId/academyId huérfanos
  (FKs peladas: pagos de personas borradas por la limpieza de fixtures
  - sin ese filtro el createMany falla P2003).
- **Aplicado en dev**: 21.159 insertados, 137 descartados sin actor
  válido; re-corrida = 0 nuevos (idempotencia verificada contra DB
  real).
- `src/common/activity-backfill.spec.ts` (6 tests verdes): owner ciclo
  completo con orden del timeline, dancer sin platsub, trial vencido
  expired con at=endsAt, dedup + re-corrida no-op, endpoint timeline
  (desc + labels + 404). Patrón: `require("../../scripts/...cjs")` +
  fake prisma con matchWhere (eq/in/startsWith) - `import.meta` no
  compila (module CommonJS); el import de `auth.controller` rompe el
  ciclo session.guard ⇄ auth.controller (mismo truco que
  admin.controller.spec).
- Fix: `trial.started` emitía `data.actor` pero `timelineLabel` lee
  `data.kind` - alineado a `kind` en academies.controller y pro-trial
  (igual que trial.ending/ended).

## Hecho en `a87b26ef` (task 7)

- `/me/entitlements` (`common/actor-entitlements.ts`): select
  `trialEndsAt` + `academyEntitlement` ahora usa `featuresForAcademy`
  - antes devolvía STUDIO para todo `tier null` (el trial vencido no
  cortaba nada en el front). **Gap cubierto que el handoff anterior no
  veía**: sin este fix el drawer seguía mostrando módulos.
- `lib/academy-features.ts`: espejo `academyInTrial` /
  `academyTrialExpired` / `academyHasFeature(academy, feature)` del
  API (tier null + trialEndsAt futuro → STUDIO; pasado/null → []).
  Consumidores: `AcademyTierGate`, `academy-gate` (multiAcademy),
  `visibleHubModules` (firma cambió `tier` → `academy`, test
  actualizado + 2 casos nuevos).
- `BottomNav`: con `entResolved && features.length===0` los ítems
  `/academia/*` del owner se filtran salvo allowlist
  `ACADEMY_EXPIRED_ALLOWED` = suscripción + perfil (Inicio vive fuera
  de los grupos).
- `AcademyTrialEnded` (nuevo): aviso "Tu prueba gratis terminó" + CTA
  a Suscripción; se monta en hub `/academia` (reemplaza dashboard +
  grilla) y en `/inicio` del owner (reemplaza AcademyDashboard dentro
  del AcademyGate). i18n `academy.trialEnded.{title,desc,cta}` en las
  4 locales (`parts/academyExtras.json` es donde vive el ns `academy`
  - NO existe `academy.json`).
- `class-card-projection` + ficha de clase del alumno:
  `billingBlocked` ahora incluye `academyTrialExpired` - mismo "no
  disponible" que la mora (decisión del design.md, tomada: sí).
  selects actualizados (tier+trialEndsAt en CLASS_CARD_SELECT,
  lessonAcademies ×2, ficha).

## Falta - task 8 (gates y docs)

- `openspec validate --changes` (ya verde) y **archivar el change SIN
  `--skip-specs`** para que la spec canónica quede sincronizada.
- `omni-dance.md`: trial 30d→15d, corte unificado trial/churn,
  ActivityEvent en el modelo, card CX, panel admin de trials, línea de
  vida admin, corte frontend, backfill script.
- `docs/qa-flows-inventory.md`: flujos nuevos (bienvenida, último
  día+promo, corte trial/churn, card CX, panel trials, PATCH trial,
  línea de vida, backfill, consola cortada).
- `docs/architecture.md`: modelo `ActivityEvent`, endpoints admin
  nuevos (PATCH trial ×2, GET /admin/trials, GET
  /admin/users/:id/timeline), job del barrido (sweepTrialLastDay +
  sweepTrialEnded en subscriptions.scheduler), backfill script.
- `docs/flows.md`: diagrama del ciclo de vida del trial.
- `node apps/api/scripts/export-api-docs.cjs` (API viva) →
  docs/openapi.json + postman, commitear regenerados.
- `pnpm typecheck` (verde verificado esta sesión en ambas apps),
  `pnpm lint`, `pnpm test` completo.
- **Gap de cobertura pendiente**: `resolveAcademyEntitlements` ahora
  devuelve features vacías para trial vencido - no hay spec que lo
  ejercite (actor-entitlements.spec.ts existe; falta el caso
  tier-null+trialEndsAt pasado).
- academy-invites (change separado, todo pendiente) + hallazgos de
  importación masiva de alumnos (handoff anterior, fuera del change).

## Verificación de la sesión

- `npx tsc --noEmit` apps/api: 0 errores. apps/web: 0 errores (tras
  actualizar academy-modules.test.ts al nuevo shape).
- `npx vitest run src/common/activity-backfill.spec.ts`: 6/6 verde.
- `npx vitest run academy-modules.test.ts + academy-tier-gate.test.tsx`:
  14/14 verde.
- `npx openspec validate --changes`: 3 passed, 0 failed.
- Backfill dry-run + apply + re-run contra DB dev real (ver arriba).
- Pendiente: `pnpm lint`, suite completa `pnpm test`, impeccable
  detect sobre el diff de UI (correr antes de archivar).

## Notas operativas

- Git no está en PATH del shell MSYS: `export
  PATH="/c/Program Files/Git/cmd:$PATH"`.
- Los e2e/CI usarán el backfill si quieren historia: script idempotente
  (`cd apps/api && node scripts/backfill-activity-events.cjs --apply`).
- `useActorEntitlements("ACADEMY")` sigue siendo fail-open para
  staff/instructor (entitlements solo cubren academias propias): las
  páginas gatean por `academyHasFeature` y el API por
  `featuresForAcademy` - el recorte de nav es best-effort del owner,
  igual que el patrón vigente.
