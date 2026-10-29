# Tasks: producer-score-refine

## 1. Params

- [x] Seed baseline: `crm.score.early_pts` (2), `crm.score.early_cap`
      (3), `crm.score.early_days` (3); idempotente.

## 2. Dominio (crm.service)

- [x] `computeActivity` PRODUCER: señales nuevas; `eventsRecent`
      (checkins últimas `attendance_weeks` semanas), `eventStreak`
      (eventos pasados consecutivos asistidos), `monthsContinuous`
      (meses con checkin o compra), `purchases` (TICKET por eventId +
      SERIES_PASS por seriesId, últimos `purchase_months`),
      `earlyPurchases` (compra ≥`early_days` antes del evento), tenure.
- [x] `computeScore` PRODUCER: fórmula por componentes con los mismos
      params + `early_*`; breakdown persistido.
- [x] `computeSegment` PRODUCER: AT_RISK agrega caída por eventos
      (0 en los últimos 2 eventos tras ≥2 en los 5 anteriores); CORE por
      `core_min` (unifica con ACADEMY).
- [x] Specs vitest: componentes, early purchases, atribución
      SERIES_PASS, racha de eventos, caída por eventos.

## 3. Tests existentes

- [x] Actualizar `test/gap-crm.e2e.spec.ts`: expectativas de
      score/segmento del fixture PRODUCER según la fórmula nueva.

## 4. Docs + verificación

- [x] `architecture.md` (fórmula producer), `omni-dance.md` §14.
- [x] `tsc` api limpio, vitest verde, `openspec validate` verde,
      archivar change.
