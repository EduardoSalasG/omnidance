# Delta; payments/subscriptions

## ADDED Requirements

### Requirement: Alta por transferencia con activación por comprobante

El checkout de suscripción SHALL ofrecer `paymentMethod: "TRANSFER"`
además de tarjeta. Con transferencia la suscripción queda
`PENDING_PAYMENT` (sin Flow) y se crea un `Payment` PENDING
claim-elegible; el subscriber sube comprobante (OwnMethodClaim) y el
dueño del dinero lo valida (academia para MEMBERSHIP, admin plataforma
para PLATFORM_SUB). Al aprobarse, el Payment pasa PAID, la suscripción
se ACTIVA con su primer período y se aplican los efectos del dominio.

#### Scenario: Alta membresía por transferencia

- **WHEN** el bailarín elige transferencia, sube el comprobante y la
  academia lo aprueba
- **THEN** el Payment queda PAID, la suscripción ACTIVE y el
  Enrollment vigente por el primer ciclo

### Requirement: Renovación manual por ciclo

Una suscripción con método transferencia SHALL generar un Payment
PENDING al iniciar cada ciclo de renovación, con notificación al
subscriber y camino de gracia/suspensión si no se valida a tiempo.
Con tarjeta, la renovación sigue siendo automática por Flow.

#### Scenario: Ciclo siguiente de sub manual

- **WHEN** se acerca el fin del período pagado de una sub manual
- **THEN** se crea el Payment PENDING del ciclo y el subscriber puede
  subir comprobante; sin aprobación al vencer la gracia, se suspende
