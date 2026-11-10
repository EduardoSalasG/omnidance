# Tasks: suscripciones CARD sobre MercadoPago (BYO)

## Adaptador

- [x] 1.1 Spec rojo: `MercadoPagoGateway` implementa
  `SubscriptionProvider` (`supportsSubs` true). Métodos mapeados
  según design D1: createCustomer/getCustomer(hasCard=false)/
  registerCustomerCard (preapproval pending, external_reference=subId,
  registerUrl=init_point)/createSubscription (lookup por
  external_reference)/getSubscription (status + next_payment_date +
  authorized_payments)/cancelSubscription (PUT cancelled)/
  ensurePlan+syncPlan (sin plan remoto; reprice por
  auto_recurring.transaction_amount). Fetch mockeado en specs.
- [x] 1.2 `buildAdapter`/`AccountCredentials`: sin cambios de
  credencial (`accessToken`). Si hace falta URL de retorno por
  proveedor, extender lo mínimo.
- [x] 1.3 Retorno GET del pagador (design D2): endpoint que resuelve
  `adapterFor(account)`, verifica el status remoto real y activa la
  sub solo si `authorized` (pending → queda PENDING_CARD para
  webhook/reconcile). Redirect web igual que `customerReturn`.
- [x] 1.4 `verifyWebhook` extiende a topics
  `subscription_authorized_payment` (→ BillingWebhookEvent con
  invoice paid tras fetch `GET /authorized_payments/:id`) y
  `subscription_preapproval` (→ reconcile puntual por
  `{subscriptionId}`). Ambas shapes (`type/data.id` y `topic/id`).
- [x] 1.5 `collect?`: implementar solo si `POST /authorized_payments`
  calza limpio; si no, omitir y documentar.

## Integración

- [x] 2.1 `SubscriptionsService`: `registerCustomerCard` recibe
  metadata extendida (`{personId, subId, amount, intervalCount}`) -
  providers existentes la ignoran. Verificar que `providerFor`/
  capability/routing funcionan sin más cambios (spec: sub a academia
  MP → init_point MP, gatewayAccountId sellado).
- [x] 2.2 Sweep/huérfanas y customerReturn multi-cuenta: verificar
  cobertura MP (audit `subscription/create` = creación del preapproval
  pending; buscar subs remotas por `external_reference`/`payer_email`).
- [x] 2.3 Smoke real con credenciales TEST del owner
  (`MP_SMOKE_ACCESS_TOKEN`/`MP_SMOKE_PUBLIC_KEY` en `apps/api/.env`,
  gitignored): alta de cuenta MP en una academia demo sin BYO (p.ej.
  Academia Tumbao `cmua3gao7003buas59g9fyxn5`) por `PUT
  /academies/:id/gateway-account`; sub completa
  subscribe→init_point→authorized→Payment con take→statement; cancel.
  Si el smoke falla por sandbox/túnel, documentar hasta dónde llegó.

## Cierre

- [x] 3.1 Docs: `qa-flows-inventory.md` (sub MP BYO + nota de webhook
  app-level: la academia pega `webhookUrl` en su panel MP),
  `architecture.md`/`flows.md` si el diagrama cambia, `omni-dance.md`
  (MP como procesador BYO de subs junto a Flow). openapi/postman solo
  si hay endpoints nuevos (el GET de retorno cuenta).
- [x] 3.2 i18n: solo keys es-CL si el copy lo exige; paridad
  `i18n-parity.cjs` sin nuevo drift.
- [x] 3.3 Verde completo: `pnpm --filter @omnidance/api test` +
  typecheck/build API + `openspec validate --changes`.
