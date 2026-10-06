# Tasks - subscription-port-generic

- [x] `ports.ts`: `RemoteSubscription` + `SubscriptionInvoice`
  normalizados (status enum + rawStatus, morose/cancelAtPeriodEnd
  booleanos, `paid` por invoice, `payment.{orderRef,data}`); fuera
  `FlowSubscription`/`FlowInvoice`/`isFlowInvoicePaid`;
  `getRegisterStatus` → `{registered, customerId}`.
- [x] `flow.gateway.ts`: normalización en la frontera (status 4→
  CANCELED, 1→ACTIVE, resto→UNKNOWN+rawStatus; regla paid interna;
  payment→{orderRef,data}).
- [x] `stub.gateway.ts`: emitir tipos normalizados.
- [x] `subscriptions.service.ts` + `platform-subscriptions.service.ts`:
  provider resuelto por `payments.subscription_gateway` contra
  `GatewayRegistry` (async) + capability check; consumir campos
  normalizados; renombrar `createFlowSubscription` →
  `createRemoteSubscription`.
- [x] Callers de `flow-customer.ts` pasan el provider resuelto.
- [x] Seed `payments.subscription_gateway` = "FLOW" + fila en
  architecture.md.
- [x] Specs actualizados al contrato normalizado + caso provider sin
  capability → error claro.
- [x] Docs (architecture, ci-cd si aplica, handoff) + openspec
  validate + suite completa + commit en dev.
