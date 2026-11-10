# Tasks: suscripciones CARD de academia por pasarela propia

## Resolución y alta

- [x] 1.1 Spec rojo: `subscribe` de un plan de academia con cuenta BYO
  crea la sub con `gatewayAccountId` y resuelve el adaptador de ESA
  cuenta (customer/plan espejo en su proveedor). Sin cuenta →
  `academy.no_gateway`; cuenta sin motor → mismo error (variante
  capability); `collectionsBlockedAt` → `academy.collections_blocked`;
  `billingBlockedAt` sigue igual. TRANSFER nunca consulta la cuenta.
- [x] 1.2 `providerFor(sub)` único: `gatewayAccountId` →
  `accounts.adapterFor` + capability check; `null` → `provider(currency)`
  actual. Toda llamada remota de `SubscriptionsService` pasa por él
  (subscribe, createRemoteSubscription, customerReturn,
  reconcileSubscription, reconcileAll, cancel, collect, sweep,
  syncPlan/reprice, reminders con getSubscription).
- [x] 1.3 Espejos namespaceteados: `gatewayCustomerIds` por
  `"<GATEWAY>:<accountId>"` (plana `"<GATEWAY>"`/`flowCustomerId` solo
  plataforma); `remoteRefs`/`remotePlanId`/`markBaseMirror` por
  `"<GATEWAY>:<accountId>:<CURRENCY>"`. `ensureFlowCustomer` extiende su
  scope (param `scope`/`accountKey`) - PlatformSubscriptionsService
  (plataforma pura) conserva clave plana.

## Webhooks y retornos

- [x] 2.1 `POST /payments/flow/customer-return?account=<id>`: query
  opcional; con cuenta → adaptador por `adapterFor` + sub del person
  con ese `gatewayAccountId`; sin cuenta → comportamiento actual. La
  sub BYO recibe `returnUrl` con `?account=` en `registerCustomerCard`.
- [x] 2.2 `POST /payments/subscription-webhook?account=<id>`: con
  cuenta → reconcile solo de subs de esa cuenta por su adaptador; sin
  cuenta → barrido plataforma actual. `urlCallback` horneado por
  `buildAdapter` ya lleva `?account=` (verificar con spec).
- [x] 2.3 `dispatchBilling`: exigir consistencia cuenta↔sub
  (`sub.gatewayAccountId === account` del query cuando ambos non-null;
  mismatch → reject como el confirm de órdenes). Reconcile puntual por
  `providerFor(sub)`.

## Reconcile, scheduler y ciclo de vida

- [x] 3.1 `reconcileAll` barre subs de todas las cuentas (agrupar por
  `gatewayAccountId`); errores por sub aislados (cuenta disabled →
  log y sigue, nunca cae a plataforma).
- [x] 3.2 `cancel`: remota por `providerFor`; cuenta no disponible →
  cancel local + log (no bloquea al usuario). Collect de invoice
  impaga por `providerFor`.
- [x] 3.3 Sweep de huérfanas: extiende a cada cuenta BYO ACTIVE con
  motor (`GatewayAudit.gatewayAccountId` filtra las llamadas
  `subscription/create` de la cuenta).
- [x] 3.4 Settle de alta y renovación: el Payment de una sub BYO
  congela `gatewayAccountId` + `academyTakeRate`/`academyTakeClp`
  (regla `academy_fee.net_pct`, misma que one-off) → entra al
  statement del período. Subs `null` sin take (legacy 1:1). Spec rojo:
  renovación BYO → Payment con take; renovación legacy → sin take.

## Superficies y cierre

- [x] 4.1 Quote de suscripción de membresía expone `gatewayAvailable`/
  `collectionsBlocked` (mismos códigos que one-off); front de
  membership-checkout deja de ofrecer CARD cuando `!gatewayAvailable`
  (TRANSFER/claim sigue). `subscription-manage` sin cambio de
  contrato.
- [x] 4.2 i18n: solo keys nuevas en es-CL si el copy lo exige (reusar
  `academy.no_gateway`/`academy.collections_blocked` del checkout);
  paridad `node apps/web/scripts/i18n-parity.cjs` sin nuevo drift.
- [x] 4.3 Docs: `docs/qa-flows-inventory.md` (flujo sub BYO alta/
  renovación/no_gateway/blocked), `docs/architecture.md` y
  `docs/flows.md` si el diagrama cambia, `omni-dance.md` si la regla
  de producto lo amerita. openapi.json + postman regenerados si hay
  endpoints nuevos (query params no rompen, pero commitear igual).
- [x] 4.4 Verde completo: `pnpm --filter @omnidance/api test` +
  typecheck/build API + `pnpm --filter @omnidance/web typecheck` +
  `openspec validate --changes`.
