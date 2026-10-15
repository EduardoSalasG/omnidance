# Handoff 2026-10-15 — scores de relación por componentes (academy + producer)

## Completado

**Changes `academy-score-refine` + `producer-score-refine`** — implementados, verificados y archivados en OpenSpec. Commits `a7719d8` y `6189b52` en `dev`.

### Fase 2 — productor (commit `6189b52`)
- Fórmula PRODUCER por componentes: `eventsRecent` (checkins últimas 8 semanas), `eventStreak` (eventos pasados consecutivos asistidos — solo PUBLISHED/LIVE/CLOSED, DRAFT/CANCELLED no rompen racha), `monthsContinuous` (checkin o compra), `purchases` (TICKET por `eventId` + SERIES_PASS por `sp_<seriesId>_`→`EventSeries.producerId`), `earlyPurchases` (compra ≥`crm.score.early_days` antes del evento), tenure, referrals. Breakdown con claves producer (`eventsRecent`, `eventStreak`, `earlyPurchases`, ...).
- Params nuevos: `crm.score.early_days/early_cap/early_pts` (3/3/2) — el resto compartidos con ACADEMY.
- AT_RISK por caída a nivel evento (0 de los últimos 2 tras ≥2 de los 5 anteriores) — implementado via `PersonActivity.dropping` que cada universo calcula.
- CORE unificado a `score ≥ crm.score.core_min` para ambos actores (PRODUCER pierde el umbral legado de ≥3 asistencias).
- Ficha `/crm/personas/[id]` muestra el desglose genérico (`personDetail.components.*` en i18n).
- `gap-crm.e2e` actualizado a la fórmula nueva (rangos en vez de números exactos — dependen del calendario).
- Smoke real: producer scores con spread sano (62 CORE / 58-59 borde; ya no dominado por spend).

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
- AT_RISK por caída: ACADEMY por ventanas 4w/4w; PRODUCER por eventos (últimos 2 vs 5 anteriores). Ambos setean `PersonActivity.dropping`.
- Score "saturado" en seed (academias con muchas asistencias) — normal; los pesos son tunables.
- Openspec archive puede dejar `.openspec-archive.lock` stale — borrarlo y reintentar. Proposal requiere secciones `## Why`/`## What Changes` en inglés.

## Pendiente / próximo slice

- Posibles fases futuras del score: VENUE/DJ/INSTRUCTOR (sin universo aún), ratings como señal (descartado por privacidad en el spec).
- `brag-output/` sigue sin trackear (decidir `.gitignore` o borrar).
