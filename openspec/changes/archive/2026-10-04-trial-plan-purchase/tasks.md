# Tasks

1. [x] `checkout.service.ts`: quitar el rechazo TRIAL en
   `purchaseMembership` y `membershipQuote`; agregar rechazo
   `price <= 0` solo para TRIAL (`PlanNotPurchasableError` con mensaje
   claro — la prueba gratis es asignación staff).
2. [x] `payment-settlement.service.ts` `settleMembership`: rama
   `plan.type === "TRIAL"` → siempre `enrollment.create` status TRIAL
   (sin findFirst/update ni extensión) + notificación
   `Clase de prueba comprada`.
3. [x] Specs: `checkout.service.spec.ts` — compra TRIAL ok (inscrito y
   no inscrito), price 0 → 400, plan inactivo → 400.
   `payment-settlement.service.spec.ts` — settle crea TRIAL nuevo con
   ACTIVE intacto, re-compra crea otra fila, notificación con copy.
4. [x] `pnpm --filter @omnidance/api exec tsc --noEmit` + specs de
   payments verdes.
