# Delta: enrollment-model (academy-import-invites)

## ADDED Requirements

### Requirement: Inscripción sin plan

Una inscripción sin `planId` SHALL considerarse administrativa
(legado): mientras esté `ACTIVE` reserva con cuota ilimitada y
`endsAt` null no vence. Por eso la data existente con
`status=ACTIVE AND planId IS NULL` SHALL migrarse a `INACTIVE` en la
migración de este change, y ningún canal SHALL crear nuevas
inscripciones `ACTIVE` sin plan (el import ya no escribe
enrollments, el alta staff exige plan, el checkout exige plan). El
toggle de estado del staff permanece libre en ambos sentidos:
reactivar manualmente una inscripción legítima sin plan está
permitido.

#### Scenario: migración one-shot de sin-plan

- **WHEN** corre la migración del change
- **THEN** todo Enrollment `ACTIVE` con `planId` null queda
  `INACTIVE`: deja de contar como alumno vigente y de habilitar
  reserva

#### Scenario: legítimo reactivado a mano

- **GIVEN** una inscripción migrada a `INACTIVE` que sí era válida
- **WHEN** el staff la reactiva por el toggle
- **THEN** vuelve a `ACTIVE` con la semántica administrativa vigente
  (cuota ilimitada)
