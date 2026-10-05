# gamification-seed

## ADDED Requirements

### Requirement: El seed demuestra gamificación coherente con la actividad

`SEED_ENV=dev` SHALL sembrar temporadas pasadas del evento recurrente con sesiones CONFIRMED/RATED repartidas en semanas distintas, de modo que las rachas semanales y los badges por conducta (≥10 sesiones → `bailarin_constante`) se computen de verdad. SHALL crear una `Season` activa y entradas `PointLedger` idempotentes ancladas a ids reales (session_confirmed/rating_closed por sesión, early_checkin por check-in temprano), `PersonBadge` con al menos un `featured` para el QR y filas `Streak` WEEKLY_OUT coherentes con la actividad.

#### Scenario: Racha real

- WHEN el dancer demo tiene sesiones confirmadas en 3 semanas consecutivas
- THEN /gamification/me/streak reporta currentWeeks ≥ 3

#### Scenario: Puntos de temporada

- WHEN se consulta /gamification/me/points del dancer demo
- THEN el total refleja las entradas del ledger de la Season activa

#### Scenario: Idempotencia

- WHEN el seed corre dos veces
- THEN no duplica PersonBadge, PointLedger ni Streak (claves naturales)
