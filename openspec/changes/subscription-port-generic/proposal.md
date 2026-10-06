# Subscription port genérico

## Problema

El puerto `SubscriptionProvider` (`payments/domain/ports.ts`) expone
tipos con nombre y semántica de proveedor: `FlowSubscription`,
`FlowInvoice`, `isFlowInvoicePaid` con códigos Flow (`status===4`,
`morose===1`, `cancel_at_period_end===1`, `payment.paymentData`). Los
services de dominio (`SubscriptionsService`,
`PlatformSubscriptionsService`) parsean esos códigos directamente -
cualquier adaptador nuevo (MP preapproval, Stripe Billing) tendría que
emular la API de Flow. Además ambos services resuelven el provider
desde el `PAYMENT_GATEWAY` único inyectado, ignorando el
`GatewayRegistry` del slice anterior.

## Propuesta

- Tipos normalizados del puerto: `RemoteSubscription`
  (`status: "ACTIVE"|"CANCELED"|"PENDING"|"UNKNOWN"` +
  `rawStatus` para logging, `morose`/`cancelAtPeriodEnd` booleanos,
  `nextInvoiceDate`, `planId`, `subscriptionId`) y
  `SubscriptionInvoice` (`id`, `amount`, `paid` normalizado por el
  adaptador, `periodStart/End`, `payment: {orderRef?, data?}` donde
  `data` es `NormalizedGatewayData`). `FlowSubscription`/`FlowInvoice`/
  `isFlowInvoicePaid` salen del contrato.
- El adaptador Flow mapea sus códigos a los tipos normalizados en
  `createSubscription`/`getSubscription` (status 4→CANCELED, 1→ACTIVE,
  resto→UNKNOWN conservando `rawStatus`; `isFlowInvoicePaid` queda
  interno del adaptador). `getRegisterStatus` se normaliza a
  `{registered, customerId}`.
- Los services resuelven el provider por param
  `payments.subscription_gateway` (seed `FLOW`) contra el
  `GatewayRegistry` + capability check `SubscriptionProvider` -
  nunca por `PAYMENT_GATEWAY` ni por `name`.
- MP preapproval/Stripe quedan como slots: implementar
  `SubscriptionProvider` y cambiar el param.

## Riesgos

- Refactor mecánico amplio (2 services ~1.5k líneas + specs):
  se mitiga manteniendo semántica 1:1 (UNKNOWN se trata como ACTIVE,
  igual que hoy un status ≠4) y suite completa de 1574 tests.
- `MembershipSubscription.flowSubscriptionId` / `PlatformSubscription
  .flowSubscriptionId` conservan el nombre de columna (es el id remoto
  del proveedor vigente; renombrar es migración + blast radius sin
  valor hoy).

## Criterios de aceptación

- Ningún archivo fuera de `flow.gateway.ts`/`stub.gateway.ts`
  referencia tipos `Flow*` ni códigos numéricos de estado remoto.
- Reconcile, cancelación, mora y compensación de huérfanas funcionan
  idéntico (suite verde).
- `payments.subscription_gateway="MERCADOPAGO"` (provider sin
  capability) → los flujos de suscripción fallan con error claro,
  no con cuelgue ni fallback silencioso al provider equivocado.
