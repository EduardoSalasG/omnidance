# events/producer-export — delta

## ADDED Requirements

### Requirement: Filtros opcionales en exports

Los endpoints `GET /events/:id/export.{csv,pdf}` y
`GET /events/series/:seriesId/export.{csv,pdf}` SHALL aceptar filtros
opcionales además de `dataset`, compartiendo la misma whitelist del motor
de consultas: `from`/`to` (ISO date sobre el campo temporal del dataset),
y por dataset: `sales` → `status` (ACTIVE|USED|TRANSFERRED|CANCELLED),
`channel` (PRESALE|DOOR); `checkins` → `method` (SCAN|MANUAL|OFFLINE),
`voided` (all|only|exclude); `guestlist` → `status` (PENDING|ARRIVED),
`listId`. Valor inválido de filtro enum → 400; filtros desconocidos se
ignoran. Sin filtros el comportamiento es idéntico al actual (todos los
registros del evento/serie). El resumen del reporte refleja el resultado
filtrado.

#### Scenario: export filtrado

- **GIVEN** un evento con tickets ACTIVE y CANCELLED
- **WHEN** se pide `export.csv?dataset=sales&status=CANCELLED`
- **THEN** el CSV solo contiene los tickets CANCELLED y el resumen cuenta
  solo esos

#### Scenario: filtro inválido

- **WHEN** `export.csv?dataset=sales&status=FOO` → 400
