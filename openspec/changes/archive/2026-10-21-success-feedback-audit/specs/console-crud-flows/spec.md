# Delta: Feedback de éxito en mutaciones

## ADDED Requirements

### Requirement: Toda mutación visible al usuario emite feedback perceptible

Toda acción que muta estado SHALL producir feedback de éxito perceptible
en el punto de la acción: `notice` inline con `role="status"`, el atom
`ActionNotice` (posición fija) cuando el punto puede quedar fuera del
viewport, o ConfirmSheet previo para acciones destructivas/financieras.
Un cambio de estado implícito (badge, fila que desaparece, redirect)
por sí solo SHALL NOT ser el único feedback. Fallos SHALL producir
feedback de error perceptible (`role="alert"`), nunca silencio.

#### Scenario: reserva de clase desde la lista scrolleado abajo

- **WHEN** el usuario reserva una clase desde `/clases` estando en la
  parte baja de la lista
- **THEN** ve la confirmación de éxito sin scrollear (ActionNotice fijo)

#### Scenario: aprobar comprobante de cobro

- **WHEN** productor/admin aprueba un claim/comprobante
- **THEN** hay confirmación previa (ConfirmSheet) o el feedback de éxito
  es explícito antes de la navegación

#### Scenario: acción de dinero falla

- **WHEN** approve/pay/generate del admin o métodos de pago del
  productor fallan (no-ok o error de red)
- **THEN** el usuario ve un error perceptible con role="alert"
