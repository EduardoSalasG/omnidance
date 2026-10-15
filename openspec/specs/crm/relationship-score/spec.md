# crm/relationship-score Specification

## Purpose
Score de relación privado actor→persona (`RelationshipScore`): cuánto
vale/está comprometida una persona para un actor B2B (academia, productor,
venue, dj, instructor). Es CRM para el actor - la persona nunca ve el
número ni el desglose.

## Requirements

### Requirement: Fórmula del score ACADEMY

Para `actorType = ACADEMY`, `recomputeScores` SHALL computar
`score = min(100, suma)` de estos componentes por persona:

- `attendanceRecent`: asistencias (`Attendance` en clases de slots de la
  academia) en las últimas `crm.score.attendance_weeks` semanas (param,
  default 8) × `crm.score.attendance_pts` (param, default 4).
- `weeklyStreak`: semanas consecutivas actuales con ≥1 asistencia, capada
  a `crm.score.streak_cap` (param, default 8), × `crm.score.streak_pts`
  (param, default 3). La semana en curso cuenta solo si ya tiene
  asistencia.
- `monthsContinuous`: meses calendario consecutivos hacia atrás con ≥1
  asistencia o membresía vigente (`Enrollment`/`MembershipSubscription`
  activo en ese mes), capado a `crm.score.months_cap` (param, default 6),
  × `crm.score.months_pts` (param, default 4).
- `purchases`: cantidad de compras PAID en los últimos
  `crm.score.purchase_months` meses (param, default 6), capada a
  `crm.score.purchase_cap` (param, default 6), × `crm.score.purchase_pts`
  (param, default 3). Compras = `Payment` PAID resueltos a la academia
  (`orderType=MEMBERSHIP` vía `mem_<planId>_` → plan.academyId;
  `orderType=WORKSHOP` vía `wks_<classId>_` → class.slot.academyId;
  `orderType=PRIVATE` vía `pvt_<academyId>_`) + `PaymentClaim` APPROVED de
  la academia.
- `tenure`: meses completos desde la primera inscripción, capado a
  `crm.score.tenure_cap` (param, default 12), × `crm.score.tenure_pts`
  (param, default 1).
- `referrals`: `Referral` donde la persona es referrer ×
  `crm.score.referral_pts` (param, default 5).

Todos los pesos SHALL leerse de `PlatformParam` con los defaults
declarados; un param ausente usa su default sin error.

#### Scenario: alumno núcleo

- **GIVEN** un alumno con 16 asistencias en 8 semanas, racha de 8 semanas,
  6 meses continuos, 5 compras en 6m, 12 meses de antigüedad
- **WHEN** corre el recompute
- **THEN** score = min(100, 64 + 24 + 24 + 15 + 12) = 100 (cap)

#### Scenario: alumno nuevo reciente

- **GIVEN** un alumno con 4 asistencias en 8 semanas, racha 2, 1 mes
  continuo, 1 compra, 1 mes de antigüedad, sin referrals
- **WHEN** corre el recompute
- **THEN** score = 16 + 6 + 4 + 3 + 1 = 30

#### Scenario: compra atribuida por refId

- **GIVEN** un `Payment` PAID `orderType=WORKSHOP` con `refId`
  `wks_<classId>_<uuid>` cuya clase pertenece a un slot de la academia A
- **WHEN** corre el recompute de A
- **THEN** la compra cuenta en `purchases` del score de esa persona en A

### Requirement: Breakdown persistido

`RelationshipScore` SHALL tener el campo `breakdown Json?` que persiste
los componentes computados (`{attendance, weeklyStreak, monthsContinuous,
purchases, tenure, referrals, attendanceRecent, attendancePrev4w}` con los
puntos aportados por componente) en cada recompute. Scores computados
antes de la migración conservan `breakdown = null` y las vistas SHALL
degradar a solo número + segmento sin error.

#### Scenario: ficha explicable

- **GIVEN** un score recomputado con la fórmula nueva
- **WHEN** se consulta la ficha del contacto/alumno
- **THEN** la respuesta incluye `breakdown` con el aporte de cada
  componente

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

### Requirement: Recompute diario programado

El sistema SHALL registrar el job `crm.scores` en el scheduler
declarativo (ScheduledJob administralo desde /admin/jobs) con default
diario 06:00 `America/Santiago`. El handler SHALL recomputar los scores
de todos los actores con universo propio (hoy ACADEMY y PRODUCER) y
reportar conteos por actorType en `JobRun.meta`. `POST
/crm/scores/recompute` SHALL seguir disponible para recompute manual de
un actor.

#### Scenario: corrida diaria

- **GIVEN** 2 academias y 1 productor con actividad
- **WHEN** corre el job `crm.scores`
- **THEN** los RelationshipScore de los 3 actores quedan actualizados y
  el JobRun registra `{ACADEMY: n, PRODUCER: m}`

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
