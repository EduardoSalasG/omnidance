# Tasks: academy-score-refine

## 1. Datos

- [x] Migración `RelationshipScore.breakdown Json?` (`pnpm db:migrate`).
- [x] Seed baseline: params `crm.score.*` (attendance_weeks/attendance_pts,
      streak_cap/streak_pts, months_cap/months_pts, purchase_months/
      purchase_cap/purchase_pts, tenure_cap/tenure_pts, referral_pts,
      core_min, new_days, brings_people_referrals); idempotente.

## 2. Dominio CRM (api)

- [x] `computeActivity` ACADEMY: extender señales (attendance por
      ventanas 8w/4w/4w-prev, purchases via refId + claims, membership
      months, tenure) + `weeklyStreak`/`monthsContinuous` helpers.
- [x] `recomputeScores`: fórmula nueva con params, breakdown persistido,
      segmentos refinados (AT_RISK por caída, CORE por umbral).
- [x] `recomputeAllScores()` para el job (todos los actores con
      universo).
- [x] Scheduler `crm.scores` registrado (default `0 6 * * *`,
      America/Santiago).
- [x] `GET /crm/people/:personId` incluye `breakdown`.
- [x] Specs vitest: fórmula por componente, caps, segmentos (incl.
      caída), breakdown, job handler.

## 3. Endpoints academy/admin

- [x] `GET /academies/:id/students`: +`score`/`segment` por ítem (join
      RelationshipScore por personIds de la página).
- [x] `GET /academies/:id/students/:personId`: incluir `breakdown`.
- [x] Admin user detail: +scores por actor (con breakdown y nombre del
      actor resuelto).
- [x] `GET /admin/...` score-health por academia + página
      `/admin/academias`.

## 4. Web

- [x] `/academia/alumnos`: badge score+segmento por fila (placeholder
      "—" sin score).
- [x] `/academia/alumnos/[personId]`: desglose de componentes.
- [x] `/admin/usuarios/[personId]`: sección "Scores por actor".
- [x] `/admin/academias`: salud por academia + link desde el hub.
- [x] i18n: keys nuevas en parts correspondientes (`academy`, `admin`,
      `crm`).

## 5. Verificación + docs

- [x] `tsc --noEmit` api+web limpio, vitest verde.
- [x] `openspec validate --changes` verde.
- [x] openapi.json + postman regenerados; `architecture.md` (params,
      job, endpoints); `omni-dance.md` §11/§14 (fórmula).
- [ ] Archivar el change sin `--skip-specs`.
