# Delta: academies/payment-claims

## ADDED Requirements

### Requirement: Intento de pago en efectivo salta a validación

Cuando el método elegido es `CASH` (efectivo en clase), el intento
SHALL crear el claim directamente en estado `PENDING` (no `AWAITING`)
y SHALL notificar al owner con `payment_claim_new`, igual que la
subida de comprobante. El alumno no tiene receibo que adjuntar: la
validación la hace el owner al cobrar en persona.

#### Scenario: intento con método efectivo

- **WHEN** el alumno confirma un intento de pago con método CASH
  (plan o clase particular)
- **THEN** el claim nace PENDING en la cola de validación del owner
  y el owner recibe la notificación de pago por validar

#### Scenario: copy del estado pendiente en efectivo

- **WHEN** el alumno revisa su claim CASH pendiente en el checkout
- **THEN** el texto indica que la academia confirma el pago en
  efectivo al asistir (no "comprobante en revisión")
