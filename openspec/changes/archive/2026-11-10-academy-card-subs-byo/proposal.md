# Proposal: suscripciones CARD de academia por pasarela propia (BYO)

## Resumen

`academy-byo-collections` dejó las ventas one-off de academia cobrando
por la pasarela propia del actor (`ActorGatewayAccount`), con take 1%
neto+IVA facturado mes vencido. Las **suscripciones CARD quedaron en
interim**: `SubscriptionsService` sigue cobrando por nuestra cuenta
Flow (customer/plan espejo en el provider de plataforma) y sus
renovaciones entran al modelo histórico de payout.

Este change cierra el interim: una `MembershipSubscription` de una
academia con cuenta BYO activa SHALL crearse, cobrarse, reconciliarse
y cancelarse sobre **el adaptador de esa cuenta**, con
`sub.gatewayAccountId` (columna ya creada) como fuente de verdad del
scope. La plata de las mensualidades nunca pasa por Omnidance; cada
renovación devenga el mismo take congelado por Payment que una venta
one-off BYO.

## Alcance

- **Alta**: `subscribe` resuelve `accounts.activeForAcademy(academyId)`
  + capability `SubscriptionProvider` por presencia de métodos. Sin
  cuenta o sin motor → `academy.no_gateway` (misma semántica del
  checkout one-off: solo claim manual TRANSFER).
  `collectionsBlockedAt` → `academy.collections_blocked`.
- **Motor per-account**: customer y plan espejo/remoto materializados
  en el proveedor DE LA ACADEMIA. Las claves de mapeo se namespacetean
  por cuenta (`gatewayCustomerIds["FLOW:<accountId>"]`,
  `remoteRefs["FLOW:<accountId>:CLP"]`) - el mismo alumno puede tener
  customers distintos en el Flow de plataforma y en el de cada
  academia.
- **Webhooks y retornos por cuenta**: el `urlCallback` del plan espejo
  por cuenta ya lleva `?account=<id>` (horneado en `buildAdapter` por
  el change BYO); este slice hace que `subscription-webhook`,
  `customer-return` y `dispatchBilling` resuelvan el adaptador por esa
  cuenta.
- **Reconcile/scheduler/cancel/collect/sweep** resuelven provider por
  `sub.gatewayAccountId`; `null` sigue siendo el provider de
  plataforma (subs legacy pre-slice y academias sin BYO... no -
  academias sin BYO ya no crean subs CARD nuevas; `null` = legacy
  histórico).
- **Take en renovaciones**: el Payment de cada invoice pagada de una
  sub BYO congela `gatewayAccountId` + `academyTakeRate`/
  `academyTakeClp` (misma regla `academy_fee.net_pct` del change BYO) →
  viaja en el `AcademyCollectionsStatement` del período.
- **Cutover**: subs vigentes con `gatewayAccountId: null` siguen en
  our-Flow y en el modelo histórico de payout. Migrarlas (cancel
  remota + re-suscripción o port) queda FUERA del alcance - decisión
  operativa posterior.

## Por qué ahora

- La infraestructura ya está: `ActorGatewayAccount` actor-scope,
  adaptador por cuenta cacheado con `subscriptionCallbackUrl`
  horneando `?account=`, capability check `supportsSubs` en checkout,
  columna `MembershipSubscription.gatewayAccountId` indexada.
- Sin este slice, academias BYO cobran one-off en su cuenta pero las
  mensualidades en la nuestra: modelo mixto que deja la peor parte del
  GMV recurrente como merchant of record nuestro y mete renovaciones
  al payout deprecado.
