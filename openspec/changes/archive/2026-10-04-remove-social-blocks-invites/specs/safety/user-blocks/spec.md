# user-blocks — deltas

## REMOVED Requirements

### Requirement: Bloquear a una persona

**Reason**: funcionalidad eliminada por decisión de producto — los
bailes solo se registran vía escaneo QR; el bloqueo perdió su
superficie de enforcement y nunca tuvo UI.

#### Scenario: removed

- **WHEN** la feature se elimina del código
- **THEN** ningún endpoint de bloqueo responde (404) y la tabla
  `UserBlock` deja de existir.

### Requirement: Desbloquear y listar bloqueos

**Reason**: eliminada junto al feature completo.

#### Scenario: removed

- **WHEN** `GET/DELETE /api/blocks` se consulta
- **THEN** responde 404.

### Requirement: Enforcement en invitaciones de sesión

**Reason**: las invitaciones a bailar se eliminan también — `POST
/sessions/invite` y su ciclo confirm/decline dejan de existir; el
bloqueo no tiene superficie donde aplicar.

#### Scenario: removed

- **WHEN** `POST /api/sessions/invite` se invoca
- **THEN** responde 404.
