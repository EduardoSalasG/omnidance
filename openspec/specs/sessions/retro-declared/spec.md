# sessions/retro-declared Specification

## Purpose
Las `DanceSession` históricas `retroDeclared` (declaradas manualmente cuando existía `POST /sessions/declare` — eliminado: los bailes solo nacen del escaneo QR) conservan su regla de exclusión de Prime Time.

## Requirements

### Requirement: Exclusión de Prime Time

Las sesiones `retroDeclared` SHALL contar para perfil, historial, streaks y badges, pero MUST NOT contar para el contador ni el reveal de Prime Time.

#### Scenario: contador excluye declaradas

- **WHEN** un evento tiene 10 sesiones confirmadas de las cuales 3 son `retroDeclared`
- **THEN** el contador Prime Time muestra 7

#### Scenario: leaderboard/reveal excluye declaradas

- **WHEN** se computan los ganadores del reveal
- **THEN** solo sesiones con `retroDeclared = false` aportan evaluaciones al cálculo
