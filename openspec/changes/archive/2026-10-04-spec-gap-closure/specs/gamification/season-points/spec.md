# season-points

## Purpose

Puntos de temporada: única moneda de progreso, **no gastable** — se acumulan por conductas (sesiones, ratings cerrados, check-in temprano, misiones), alimentan el leaderboard de temporada y resetean por temporada (spec §7).

## ADDED Requirements

### Requirement: Acumulación por conductas

El sistema SHALL acreditar puntos en `PointLedger` cuando ocurren conductas verificables: sesión confirmada, rating cerrado, check-in temprano (antes de la hora definida por plataforma), misión cumplida.

#### Scenario: sesión confirmada suma

- **WHEN** una sesión pasa a CONFIRMED
- **THEN** ambos participantes reciben su entrada de puntos en el ledger de la temporada activa

#### Scenario: rating cerrado suma

- **WHEN** una persona completa un rating pendiente
- **THEN** recibe puntos por cerrar su evaluación

#### Scenario: idempotente por conducta

- **WHEN** la misma conducta se procesa dos veces (re-webhook, retry, re-evaluación)
- **THEN** no se duplican los puntos — cada conducta acredita una sola vez

### Requirement: Consulta de puntos

El sistema SHALL exponer el total de puntos de la temporada activa del usuario autenticado.

#### Scenario: total del usuario

- **WHEN** una persona consulta `GET /gamification/me/points`
- **THEN** recibe su total acumulado de la temporada activa y el detalle por tipo de conducta
