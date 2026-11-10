# Delta: trial-plan-purchase

## REMOVED Requirements

### Requirement: Checkout de plan TRIAL

**Reason:** `PlanType.TRIAL` desaparece del modelo
(enrollment-plan-simplify). La "clase de prueba" pasa a ser un
`CLASS_PACK` con `classCount` (normalmente 1) que entra al checkout por
el flujo normal de cualquier tipo; la regla de no vendible se generaliza
a `price <= 0` de cualquier tipo (ver delta `enrollment-model`,
requirement "Venta online de planes gratis").

**Migration:** planes TRIAL existentes migran a `CLASS_PACK` con
`classCount = 1` (migración `enrollment_plan_simplify`).

### Requirement: Settle crea Enrollment TRIAL sin tocar la vigente

**Reason:** sin tipo TRIAL no hay fila aparte: el settle de un
`CLASS_PACK` (incluida la clase de prueba comprada) cae en el flujo
normal de `settleMembership` (crea/actualiza el Enrollment ACTIVE con
el plan comprado).

### Requirement: Notificación de compra de prueba

**Reason:** la notificación `payment.membership` queda con title fijo
`Plan activo` para toda compra de plan; el nombre del plan ("Clase de
prueba") sigue viajando en el body.
