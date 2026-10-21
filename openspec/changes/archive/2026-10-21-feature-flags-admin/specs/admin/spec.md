# Delta: admin (feature-flags-admin)

## ADDED Requirements

### Requirement: Modelo de flags de funcionalidad

El sistema SHALL persistir `FeatureFlag {key, label, description?,
enabled, updatedById?, updatedAt}` como catálogo global de
funcionalidades activables, seedado desde código con defaults por
flag (un flag nuevo nace con el default que declare su seed —
`social_pass` nace `enabled:false`). `FeatureFlagsService.isEnabled`
SHALL responder desde una cache corta (≤60s) e invalidarse al
escritura.

#### Scenario: Flag nuevo en seed

- **WHEN** el seed registra `social_pass` con default `false`
- **THEN** existe el flag apagado y re-correr el seed no reactiva un
  flag que el admin encendió (upsert por key preserva `enabled`)

#### Scenario: Lectura caliente tras toggle

- **WHEN** un admin apaga un flag y otra request consulta
  `isEnabled` en el mismo proceso
- **THEN** responde el valor nuevo sin esperar expiración de cache

### Requirement: API de administración y gating

`GET /admin/feature-flags` (`admin.access`) SHALL devolver el
catálogo con label, descripción, estado y última modificación.
`PATCH /admin/feature-flags/:key {enabled}` SHALL flippear el flag,
persistir `updatedById` y auditar `FEATURE_FLAG_TOGGLE` — flag
inexistente → 404. `GET /features` SHALL ser público y devolver el
mapa `{key: enabled}` de todos los flags (los flags son metadatos de
producto, no secretos), cacheado a nivel HTTP.

#### Scenario: Toggle auditable

- **WHEN** un admin enciende `social_pass`
- **THEN** el flag queda `enabled:true`, `updatedById` = su personId
  y existe AuditLog `FEATURE_FLAG_TOGGLE` con `{flag, enabled}`

#### Scenario: Front oculta superficie apagada

- **WHEN** el front obtiene `GET /features` con
  `{social_pass:false, trip_planner:true, ...}`
- **THEN** las superficies gated por `social_pass` no se renderizan
  ni enlazan, y las de `trip_planner` sí

### Requirement: Sección de admin dedicada

`/admin/funcionalidades` (`admin.access`) SHALL listar los flags en
cards con toggle por estado, descripción y última modificación;
el toggle aplica sin confirmación (operación reversible) con
feedback inline/spinner y SHALL manejar errores sin dejar el toggle
en estado inconsistente.

#### Scenario: Error al flippear

- **WHEN** el PATCH falla (red o 403)
- **THEN** el toggle vuelve a su estado previo y se muestra el error
  — nunca queda "encendido" visualmente contra el estado real
