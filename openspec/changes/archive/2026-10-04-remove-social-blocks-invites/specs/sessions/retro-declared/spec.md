# sessions/retro-declared — deltas

## REMOVED Requirements

### Requirement: Declarar un baile retroactivamente

**Reason**: decisión de producto — los bailes solo se registran por
escaneo QR en pista (`/sessions/scan`). `POST /sessions/declare` se
elimina junto al ciclo de invitaciones; las declaraciones históricas se
conservan como dato.

#### Scenario: removed

- **WHEN** `POST /api/sessions/declare` se invoca
- **THEN** responde 404.
