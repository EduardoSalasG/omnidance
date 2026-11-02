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

El job diario `subscriptions.reconcile` (mismo scheduler de mora y
gracia) recorre las subs `TRANSFER` en estado `ACTIVE` cuyo
`currentPeriodEnd` entra en la ventana `billing.manual_renewal.lead_days`
(default 5 días) y emite la orden del ciclo siguiente
(`mem_<planId>_manual_<n+1>` / `platsub_<subId>_manual_<n+1>`, mismo
correlativo del alta) con el cargo re-resuelto del día (promo vigente
o precio lleno). Una orden PENDING viva cubre el ciclo: el barrido es
idempotente y no duplica ni re-avisa.

#### Scenario: Ciclo siguiente de sub manual

- **WHEN** el `currentPeriodEnd` de una sub manual ACTIVE entra en la
  ventana de anticipación
- **THEN** se crea el Payment PENDING del ciclo (evento ORDER_CREATED)
  y el subscriber recibe la notificación `*.transfer_renewal` con la
  URL del claim para subir comprobante

#### Scenario: Gracia de membresía por falta de comprobante

- **WHEN** el `currentPeriodEnd` de una membresía manual vence sin un
  Payment PAID del ciclo
- **THEN** el acceso a reservas sigue hasta `endsAt +
  academy.renewal.grace_days` del Enrollment (misma gracia que una
  compra vencida) y la sub queda ACTIVE con su orden PENDING: un
  comprobante tardío la reactiva y el período corre desde el pago

#### Scenario: Gracia y bloqueo de academia por falta de comprobante

- **WHEN** el `currentPeriodEnd` de una sub de plataforma ACADEMY vence
  sin claim aprobado
- **THEN** la academia recibe `billingGraceUntil = currentPeriodEnd +
  academy_billing.grace_days` y el aviso `academy.billing_grace` una
  sola vez por período; vencida la gracia el job la marca
  `billingBlockedAt` (mismo enforcement de la mora de tarjeta) y el
  settle del claim lo deshace al aprobar

#### Scenario: Productor Pro sin comprobante

- **WHEN** el `currentPeriodEnd` de una sub de plataforma PRODUCER vence
  sin claim aprobado
- **THEN** se notifica `producer.pro_renewal_failed` una sola vez por
  período (misma política que la mora de tarjeta, sin degradación
  automática del tier)

#### Scenario: Settle del claim del ciclo nuevo

- **WHEN** se aprueba el claim de la orden de renovación
- **THEN** el mismo settle activa/perpetúa la sub: `currentPeriodEnd`
  avanza un ciclo desde el fin del período previo si aún es futuro
  (nunca desde hoy), y queda despejada la gracia/bloqueo de la academia
  o restaurado el proTier del productor
