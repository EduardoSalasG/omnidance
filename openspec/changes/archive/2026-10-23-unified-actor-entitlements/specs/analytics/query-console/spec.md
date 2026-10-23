# Delta: analytics/query-console (unified-actor-entitlements)

## MODIFIED Requirements

### Requirement: Gate Producer Pro

Las entidades del lente PRODUCER (catálogo, run y export) SHALL requerir
Producer Pro efectivo del owner consultado — misma regla que los exports
actuales (`403` con el contrato unificado `tier.required`). Los lentes
ACADEMY_OWNER y ADMIN no tienen gate adicional al de rol aprobado.

#### Scenario: productor sin Pro

- **GIVEN** un PRODUCER aprobado sin Pro efectivo
- **WHEN** ejecuta `/query/run` o `/query/export.*` con role=PRODUCER
- **THEN** responde 403 `tier.required` (requiredTier PRO, feature
  analytics|exports según la operación) y la UI muestra el paywall
