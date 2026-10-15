# Handoff 2026-10-15 — academy-score-refine implementado

## Completado

**Change `academy-score-refine`** — implementado, verificado y archivado en OpenSpec (`openspec/changes/archive/2026-10-15-academy-score-refine/`).

### Datos
- `RelationshipScore.breakdown Json?` — migración `20261015000000_relationship_score_breakdown` (aplicada en dev).
- Params tunables en `PARAM_DEFAULTS` de `seed-common.ts`: `crm.score.attendance_weeks/attendance_pts`, `streak_cap/streak_pts`, `months_cap/months_pts`, `purchase_months/purchase_cap/purchase_pts`, `tenure_cap/tenure_pts`, `referral_pts`, `core_min`, `crm.new_days`, `crm.brings_people_referrals`.

### Dominio (`crm.service.ts`)
- `computeAcademyActivity`: enrollments + attendances (ventanas 8w/4w/4w-prev, racha semanal y meses continuos por calendario America/Santiago vía `weekIndex`/`monthIndex`) + compras por `Payment.refId` (`mem_`/`wks_`/`pvt_`) + `PaymentClaim` APPROVED (el Payment `claim-*` materializado se excluye para no duplicar) + `MembershipSubscription` vigente.
- `computeScore`/`computeSegment` por componentes; breakdown persistido. **PRODUCER conserva fórmula legado** (`attendance*10+spend/1000+referrals*15`, CORE por ≥3 asistencias).
- `recomputeAllScores()` + scheduler `CrmScoresScheduler` (job `crm.scores`, default `0 6 * * *` America/Santiago — registrado y verificado en `ScheduledJob`).

### Endpoints
- `GET /academies/:id/students` → +`score`/`segment` por fila.
- `GET /academies/:id/students/:personId` → +`scoreBreakdown`.
- `GET /admin/users/:personId/detail` → +`scores` (por actor, con nombre resuelto y breakdown).
- `GET /admin/academies/score-health` → nuevo (conteo, avgScore, distribución de segmentos, top-3, at-risk, `rows` drill-down).

### Web
- `/academia/alumnos`: badge score + segmento (segmentos `crm.segments.*`).
- `/academia/alumnos/[personId]`: desglose de componentes con puntos.
- `/admin/usuarios/[personId]`: sección "Scores por actor".
- `/admin/academias`: página nueva (salud por academia, top/en-riesgo, drill-down expandible → ficha de usuario admin). Link en el hub `/admin`.
- i18n: `academyExtras.studentProfile.breakdown.*`, `admin.academies.*`, `admin.users.scores.*` — `i18n-audit.cjs` → ALL_KEYS_OK.

### Docs
- `docs/architecture.md` (6 jobs + párrafo del score), `omni-dance.md` §13 fórmula, `docs/openapi.json` + postman regenerados (289 paths).

## Verificación

- `tsc --noEmit` api y web: limpio.
- Vitest: `src/crm` 26 tests + `crm-scores.spec.ts` (8 nuevos: fórmula, caps, atribución refId, dedup claim+payment, AT_RISK por caída e inactividad, NEW, CORE, BRINGS_PEOPLE). `gap-crm.e2e` 35 verde. Suite completa api: 1908/1910 → el fix de `computeSegment` PRODUCER resolvió los 2 fallos.
- Smoke real contra DB dev: `recomputeAllScores()` → `{ACADEMY: 875, PRODUCER: 1460}` con breakdowns y caps aplicando.
- `openspec validate` verde; change archivado con deltas aplicados a specs canónicas.

## Gotchas / decisiones

- `Uint8Array<ArrayBuffer>` en `PushOptIn.tsx` dio TS2315 por **cache incremental stale** de tsc — borrar `*.tsbuildinfo` si reaparece; con cache limpio compila (TS 5.9).
- `prisma migrate dev` no corre en shell no-interactivo: usar `migrate diff --from-url` + `migrate deploy` + `prisma generate` (matar el dev server antes: DLL bloqueada → EPERM).
- AT_RISK por caída solo aplica a ACADEMY; PRODUCER conserva segmentos legado (test e2e lo exige).
- Score "saturado" en seed (muchas asistencias) — normal; los pesos son tunables.

## Pendiente / próximo slice

- **Score PRODUCER refinado** (fase 2 anunciada por el usuario: compras de entradas, preventa vs puerta, asistencia a eventos, trae-gente) — mismo patrón, params `crm.score.producer.*` probablemente.
- Commit pendiente de toda la sesión.
- `brag-output/` sigue sin trackear (decidir `.gitignore` o borrar).
