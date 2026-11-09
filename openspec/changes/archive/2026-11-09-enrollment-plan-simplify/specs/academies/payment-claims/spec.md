# Delta: payment-claims

## MODIFIED Requirements

### Requirement: Validación del comprobante

`POST /academies/:id/claims/:claimId/approve` (owner/admin) SHALL en
una transacción: marcar el claim APPROVED con `reviewedBy/reviewedAt`;
crear `Payment{orderType:"MEMBERSHIP", gateway:"MANUAL", status:PAID,
amount:claim.amount, fee:0, net:claim.amount, personId:claim.personId}`;
asegurar el `Enrollment` del alumno (crearlo ACTIVE si no existe) y
extender `endsAt` con `membershipBase(now, endsAt)` +
`membershipEndsAt(plan, base)` (vigencia rodante: base + duración del
plan); idéntica regla del webhook Flow; notificar
`payment_claim_approved` al alumno.

`POST /academies/:id/claims/:claimId/reject {note}` SHALL marcar el
claim REJECTED con `reviewNote` obligatoria y notificar
`payment_claim_rejected` al alumno.

Claims ya resueltos MUST NOT poder re-aprobarse ni re-rechazarse (409).

#### Scenario: aprobar extiende la vigencia

- **GIVEN** alumno con enrollment ACTIVE y `endsAt` en 5 días y un
  claim PENDING por plan MONTHLY
- **WHEN** el owner aprueba
- **THEN** `endsAt` queda en `base + 1 mes` (base = `endsAt` vigente,
  sin comer ni regalar días), el `Payment` MANUAL queda en PAID y el
  alumno es notificado

#### Scenario: aprobar sin enrollment previo

- **WHEN** el alumno no tiene enrollment en la academia
- **THEN** la aprobación crea uno ACTIVE con `endsAt` derivado del plan

#### Scenario: rechazo con motivo

- **WHEN** el owner rechaza con `note`
- **THEN** el claim queda REJECTED, no toca el enrollment ni crea
  Payment, y el alumno ve el motivo

#### Scenario: doble resolución

- **WHEN** se aprueba o rechaza un claim no-PENDING
- **THEN** responde 409
