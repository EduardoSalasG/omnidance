# social-modules-scope

## ADDED Requirements

### Requirement: Invitaciones de baile solo sobre eventos en curso

`/bailes` SHALL mostrar invitaciones `INVITED` solo cuando exista un evento LIVE ocurriendo ahora — la invitación nace del escaneo en pista, no puede existir sobre eventos futuros ni pasados sin resolver.

#### Scenario: Seed con noche en vivo

- WHEN el seed corre y existe un evento LIVE esta noche
- THEN las invitaciones demo quedan ancladas a ese evento con scannedAt reciente
