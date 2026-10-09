# Delta — academies/private-lesson-product (instructor-commission-subtype)

El assign/create vuelven a snapshotear `commissionPct` — ahora según
el subtipo del acuerdo vigente del instructor (solo `COMMISSION`).

## MODIFIED Requirements

### Requirement: Asignación por el owner

`PATCH /private-lessons/:id` SHALL aceptar `action="assign"` con
`{instructorId, scheduledAt}`: solo owner/ADMIN, solo sobre lecciones en
`REQUESTED`; valida que el instructor pertenezca a la academia (404 si no);
setea instructor+fecha y transiciona a `CONFIRMED`, snapshotteando
`commissionPct` cuando el acuerdo del instructor es `COMMISSION`
(`commissionPct=0` en cualquier otro caso). SHALL notificar al alumno y
al instructor asignado.

#### Scenario: assign feliz

- **WHEN** el owner asigna instructor de la academia y fecha a una lección
  REQUESTED pagada
- **THEN** la lección queda CONFIRMED con `instructorId`, `scheduledAt` y
  el `commissionPct` del acuerdo (0 salvo COMMISSION); alumno e
  instructor son notificados.

#### Scenario: assign sobre lección no REQUESTED

- **WHEN** se intenta assign sobre CONFIRMED/DONE/CANCELLED
- **THEN** responde 409.

#### Scenario: assign por instructor o alumno

- **WHEN** un instructor (no owner) o el alumno intentan assign
- **THEN** responde 403.
