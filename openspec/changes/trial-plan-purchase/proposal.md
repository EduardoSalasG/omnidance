# trial-plan-purchase

## Why

La clase de prueba (`PlanType.TRIAL`) hoy solo se asigna manual por staff
(`POST /academies/:id/enrollments` con status TRIAL). El usuario la quiere
**comprable online** por cualquier alumno, inscrito o no — herramienta de
adquisición (omni-dance.md: "plan de prueba" entre los tipos de plan).
La ficha pública ya lista planes TRIAL activos con CTA "Comprar", pero el
checkout los rechaza con 400 — es un camino roto visible.

## What Changes

- `GET /checkout/membership-quote` y `POST /checkout/membership` dejan de
  rechazar `plan.type === "TRIAL"`; el plan TRIAL se cobra como orden
  one-off `MEMBERSHIP` con el mismo `service_fee.membership_clp`.
- Requisito: `price > 0` — una prueba gratis sigue siendo asignación staff
  (la pasarela no cobra CLP 0; orden con total 0 → 400
  PlanNotPurchasable).
- `settleMembership` con plan TRIAL: crea un **nuevo** `Enrollment` con
  `status: "TRIAL"` — nunca hace update del existente ni baja un
  ACTIVE/ONLINE a TRIAL. `endsAt` = derivación estándar del plan
  (`periodDays` si el owner lo configuró, si no null).
- Compra repetida de prueba → otra fila TRIAL (histórico permitido, sin
  @@unique).
- Notificación de pago: `type: "payment.membership"` con title
  `Clase de prueba comprada` y body `${plan.name} · ${academy.name} · ${clp}`
  (convención push-copy).
- El checkout web no cambia: `recurring:false` para TRIAL → solo botón de
  compra única (suscripciones ya excluyen TRIAL por tipo).

## Impact

- Affected specs: `payments/trial-plan-purchase` (nueva capability).
- Affected code: `checkout.service.ts` (quote + purchase),
  `payment-settlement.service.ts` (rama TRIAL en settleMembership),
  specs de ambos. Web sin cambios de código (labels TRIAL ya existen).
