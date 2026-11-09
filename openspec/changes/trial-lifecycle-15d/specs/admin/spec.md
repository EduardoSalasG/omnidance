# Delta: admin (trial-lifecycle-15d)

## ADDED Requirements

### Requirement: Línea de vida del actor en la ficha de usuario

La ficha admin del usuario SHALL incluir una línea de vida
cronológica descendente de los eventos relevantes del actor, por rol:
registro, solicitud y aprobación de roles, inicio y fin de trial,
aviso de último día, alta de suscripción, pagos y renovaciones,
cambios de plan, cancelación, corte de acceso, reactivación y bloqueos
por mora, para ACADEMY_OWNER y PRODUCER; para DANCER: registro,
inscripciones a academias, compras y pagos, y primeras asistencias.
El detalle SHALL salir de `GET /admin/users/:id/timeline` con
`{at, type, label, ref?}` por evento, persistido en un event store
append-only (`ActivityEvent`) sembrado con un backfill del historial
pre-existente.

#### Scenario: owner con ciclo completo

- **GIVEN** un owner que se registró, creó su academia, consumió el
  trial, se suscribió y luego canceló
- **WHEN** el admin abre su línea de vida
- **THEN** ve en orden: registro, rol aprobado, trial iniciado, aviso
  de último día, trial terminado, suscripción activada, pago,
  renovaciones, cancelación y corte de acceso

#### Scenario: dancer sin suscripción de plataforma

- **WHEN** el admin abre la línea de vida de un dancer
- **THEN** ve registro, sus enrollments con inicio/fin y sus pagos,
  sin eventos de trial ni suscripción de plataforma
