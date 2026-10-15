# crm/relationship-score — delta producer-score-refine

## ADDED Requirements

### Requirement: Fórmula del score PRODUCER

`computeScore` SHALL computar el score 0-100 de `actorType=PRODUCER` por
componentes, con los mismos `PlatformParam` `crm.score.*` que la fórmula
ACADEMY más los params `crm.score.early_pts`/`early_cap`/`early_days`.
El universo = checkins no anulados + payments PAID atribuibles (TICKET
por `eventId`, SERIES_PASS por `seriesId`→`EventSeries.producerId`).

`score = min(100, suma)` de:

- `eventsRecent` = checkins en eventos del productor en las últimas
  `attendance_weeks` semanas × `attendance_pts`.
- `eventStreak` = eventos pasados consecutivos del productor asistidos
  (del más reciente hacia atrás), cap `streak_cap`, × `streak_pts`.
- `monthsContinuous` = meses calendario consecutivos con ≥1 checkin o
  compra atribuible, cap `months_cap`, × `months_pts`.
- `purchases` = payments PAID atribuibles últimos `purchase_months`
  meses, cap `purchase_cap`, × `purchase_pts`.
- `earlyPurchases` = compras TICKET hechas ≥`early_days` (default 3)
  días antes de `event.startsAt`, cap `early_cap` (default 3),
  × `early_pts` (default 2).
- `tenure` = meses desde la primera actividad, cap `tenure_cap`,
  × `tenure_pts`.
- `referrals` × `referral_pts`.

#### Scenario: fórmula por componentes

- **GIVEN** un asistente con 3 checkins en 8 semanas, racha de 2
  eventos, 2 meses continuos, 2 compras (1 anticipada), 3 meses de
  antigüedad y 1 referral — con los defaults
- **THEN** score = 12 + 6 + 8 + 6 + 2 + 3 + 5 = 42

#### Scenario: SERIES_PASS atribuida al productor

- **GIVEN** un Payment PAID `orderType=SERIES_PASS` con refId
  `sp_<seriesId>_<month>_<uuid>` cuya serie pertenece al productor
- **WHEN** corre el recompute
- **THEN** la compra cuenta en `purchases`/`spend` de esa persona bajo
  ese productor

#### Scenario: compra anticipada puntúa extra

- **GIVEN** un Payment PAID TICKET creado 10 días antes de
  `event.startsAt` con `early_days`=3
- **THEN** cuenta en `purchases` y además en `earlyPurchases`

## MODIFIED Requirements

### Requirement: Segmentos refinados

`computeSegment` SHALL asignar el primer match en este orden:

1. `NEW` - primera actividad < `crm.new_days` (param, default 30) días.
2. `AT_RISK` - última actividad > `crm.winback_days` (param, default 21)
   días, **o** caída de asistencia:
   - ACADEMY: asistencias últimas 4 semanas < 50% de las 4 anteriores
     (mínimo 2 en la ventana previa).
   - PRODUCER: 0 checkins en los últimos 2 eventos pasados del actor
     tras ≥2 en los 5 anteriores.
3. `BRINGS_PEOPLE` - referrals ≥ `crm.brings_people_referrals` (param,
   default 2).
4. `CORE` - score ≥ `crm.score.core_min` (param, default 60) para ambos
   actores — PRODUCER migra del conteo legado de asistencias al umbral
   de score, unificando semántica.
5. `null` - resto.

#### Scenario: alumno cayendo

- **GIVEN** un alumno con 6 asistencias hace 5-8 semanas y 2 en las
  últimas 4
- **WHEN** corre el recompute
- **THEN** su segmento es `AT_RISK` aunque su última actividad sea
  reciente

#### Scenario: asistente cayendo (nivel evento)

- **GIVEN** un asistente sin checkin en los últimos 2 eventos del
  productor pero con ≥2 en los 5 anteriores
- **WHEN** corre el recompute
- **THEN** su segmento es `AT_RISK` aunque su última actividad sea
  reciente

#### Scenario: umbrales por param

- **GIVEN** `crm.score.core_min` = 70 en PlatformParam
- **WHEN** un contacto con score 65 se recomputa
- **THEN** no es `CORE`

## REMOVED Requirements

### Requirement: PRODUCER conserva su fórmula

**Reason**: fase 2 — el productor pasa a la fórmula por componentes con
las mismas primitivas que ACADEMY (más `earlyPurchases`).
