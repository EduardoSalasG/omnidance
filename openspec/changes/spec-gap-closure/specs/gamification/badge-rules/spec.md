# badge-rules

## Purpose

Reglas de conducta adicionales para badges: madrugador, maratonista y mariposa social — badges por conducta de la noche, repetibles, nunca por puntaje (spec §7, regla de oro: conductas, no juicio).

## ADDED Requirements

### Requirement: Madrugador

El sistema SHALL otorgar el badge `madrugador` a quien hace check-in antes de la hora de corte definida por plataforma (default 23:00) en un evento.

#### Scenario: check-in temprano

- **WHEN** una persona hace check-in en un evento antes de la hora de corte
- **THEN** recibe el badge madrugador (idempotente — repetible por diseño pero sin duplicar la fila)

#### Scenario: check-in tardío

- **WHEN** el check-in ocurre después de la hora de corte
- **THEN** no se otorga el badge

### Requirement: Maratonista

El sistema SHALL otorgar el badge `maratonista` a quien acumula 15+ sesiones confirmadas en un mismo evento/noche.

#### Scenario: 15+ sesiones en la noche

- **WHEN** una persona alcanza su 15ª sesión confirmada en el mismo evento
- **THEN** recibe el badge maratonista

### Requirement: Mariposa social

El sistema SHALL otorgar el badge `mariposa_social` a quien baila con 8+ parejas **distintas** en un mismo evento/noche.

#### Scenario: 8 parejas únicas

- **WHEN** una persona confirma su sesión con la 8ª pareja distinta del evento
- **THEN** recibe el badge mariposa social

#### Scenario: parejas repetidas no cuentan

- **WHEN** tiene 10 sesiones pero solo con 5 parejas distintas
- **THEN** no recibe el badge

### Requirement: Evaluación en hooks existentes

Las nuevas reglas SHALL evaluarse en los mismos puntos que las existentes (`evaluateBadgesFor` en confirm/rate y lazy en consulta) sin duplicar awards.

#### Scenario: sin duplicados

- **WHEN** la regla se evalúa múltiples veces para la misma persona y conducta ya premiada
- **THEN** no se crea un segundo `PersonBadge` para la misma combinación
