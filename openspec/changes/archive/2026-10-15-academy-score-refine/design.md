# Design: academy-score-refine

## Decisiones

- **Fórmula agregada, no ledger**: se mantiene `min(100, Σ componentes)`
  sobre `computeActivity` — sin `point_ledger` por alumno (ese modelo es
  de temporada/gamificación del bailarín). La explicabilidad se logra
  persistiendo el `breakdown` de componentes, no un ledger de eventos.
- **Breakdown en `RelationshipScore.breakdown` (Json?)**: nullable,
  escrito en cada recompute. Claves: `attendanceRecent`, `weeklyStreak`,
  `monthsContinuous`, `purchases`, `tenure`, `referrals` (conteos) y
  `points` por componente + `attendancePrev4w`/`attendanceRecent4w` para
  auditar el segmento. No se versiona — el último recompute gana.
- **Compras ACADEMY se resuelven por `refId`**: `MEMBERSHIP` →
  `mem_<planId>_` (plan→academyId), `WORKSHOP` → `wks_<classId>_`
  (class→slot→academyId), `PRIVATE` → `pvt_<academyId>_`. Patrón ya
  usado en `academies.controller.ts` (cobros/kpis) — se replica, no se
  agrega columna `academyId` a Payment. Claims APPROVED de la academia
  cuentan como compra manual.
- **Pesos en PlatformParam** bajo `crm.score.*` (misma convención que
  `crm.winback_days` con `params.getNumber(key, default)`). Params
  nuevos documentados en `docs/architecture.md`.
- **Segmentos**: orden de evaluación NEW → AT_RISK → BRINGS_PEOPLE →
  CORE. AT_RISK gana la condición "cayendo": `attendanceRecent4w <
  attendancePrev4w * 0.5` con `attendancePrev4w >= 2` (evita falsos
  positivos sobre base ~0).
- **Job `crm.scores`**: provider fino en módulo crm (mismo patrón que
  `crm.triggers` / `academies.scheduler.ts`): registra key, handler llama
  `crm.recomputeAllScores()` que itera actores ACADEMY + PRODUCER con
  universo no vacío. Distinct actorIds: academias activas + productores
  con eventos.
- **Admin score-health**: `GET /admin/score-health/academies` (o
  `/admin/academies/score-health` — confirmar convención del módulo
  admin: controllers usan `@Controller("admin")` con paths planos).
  Agregación en memoria sobre `relationshipScore.findMany({actorType:
  "ACADEMY"})` — universo acotado (academias ~decenas, scores ~miles).

## Datos afectados

- Migración `RelationshipScore.breakdown Json?` — no destructiva.
- Seed baseline: params `crm.score.*` con defaults (idempotente, mismo
  patrón que `crm.winback_days`).

## Riesgos

- Rendimiento del recompute ACADEMY: N queries por academia
  (attendances, payments, claims, memberships). Aceptable en cron
  diario; sin path caliente.
- `monthsContinuous` depende de membresía vigente por mes — sin
  histórico de estados se aproxima con enrollment activo cuya ventana
  cubre el mes o ≥1 asistencia ese mes (igual pragmatismo que
  `activeStudentsMonthPrev`).

## Alternativas descartadas

- Ledger aditivo de puntos por acción: más auditable pero crece sin
  tope, exige normalización aparte para segmentar; descartado por el
  usuario (refinar fórmula actual).
- Columna `academyId` en Payment: simplificaría queries pero es churn de
  schema sobre el ledger monetario; el patrón refId ya está probado.
