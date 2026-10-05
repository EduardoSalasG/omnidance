# trial-plan-purchase — clase de prueba comprable online

## ADDED Requirements

### Requirement: Checkout de plan TRIAL

`GET /checkout/membership-quote` y `POST /checkout/membership` SHALL
aceptar planes con `type: "TRIAL"` activos de academias activas, cobrados
como orden one-off `MEMBERSHIP` con `service_fee.membership_clp`. El
viewer puede estar inscrito o no en la academia — no hay validación de
enrollment previo.

#### Scenario: compra válida

- **GIVEN** un plan TRIAL activo con `price > 0` en academia activa
- **WHEN** un usuario autenticado hace `POST /checkout/membership {planId}`
- **THEN** se crea `Payment { orderType: "MEMBERSHIP", refId:
  "mem_<planId>_<uuid>" }` PENDING y responde `{paymentUrl, paymentId,
  quote}`

#### Scenario: rechazos

- **WHEN** el plan TRIAL tiene `price <= 0` → 400 PlanNotPurchasable (la
  prueba gratis es asignación staff, no checkout)
- **WHEN** el plan está inactivo o la academia inactiva → 400/404 igual
  que los demás tipos

### Requirement: Settle crea Enrollment TRIAL sin tocar la vigente

Al PAID, `settleMembership` con plan TRIAL SHALL crear un **nuevo**
`Enrollment { status: "TRIAL", planId, academyId, personId,
startedAt: now, endsAt: membershipEndsAt(plan, now) }` — sin actualizar
enrollments existentes.

#### Scenario: alumna ya ACTIVE

- **GIVEN** la persona tiene un Enrollment ACTIVE en la academia
- **WHEN** su compra de plan TRIAL se liquida a PAID
- **THEN** se crea una fila TRIAL nueva y el enrollment ACTIVE queda
  intacto (status, plan, endsAt sin cambios)

#### Scenario: compra repetida

- **WHEN** la misma persona compra el plan TRIAL dos veces
- **THEN** cada liquidación crea su propia fila TRIAL (histórico
  permitido)

### Requirement: Notificación de compra de prueba

La notificación TRANSACTIONAL `payment.membership` de una compra TRIAL
SHALL usar title `Clase de prueba comprada` y body
`${plan.name} · ${academy.name} · ${clp}`.

#### Scenario: alumna notificada

- **WHEN** la compra TRIAL liquida PAID
- **THEN** la notificación al comprador tiene ese title/body
