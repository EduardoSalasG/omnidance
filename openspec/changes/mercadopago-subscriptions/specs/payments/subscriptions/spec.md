# Delta: payments/subscriptions (motor MercadoPago)

## ADDED Requirements

### Requirement: Suscripciones CARD sobre MercadoPago `preapproval`

`MercadoPagoGateway` SHALL implementar `SubscriptionProvider` con el
contrato **without-plan pending** de MP (`POST /preapproval` con
`status:"pending"` → `init_point` hosted donde el pagador autoriza su
tarjeta → `back_url` → `authorized`). El adaptador SHALL mapear:
customer por `/v1/customers` (search por email + create),
`getCustomer.hasCard` siempre false (cada preapproval exige su
autorización hosted), `registerCustomerCard` = creación del
preapproval pending con `external_reference` = id local de la
suscripción y registerUrl = `init_point`, `createSubscription` =
lookup del preapproval por `external_reference` (jamás duplica),
`getSubscription` = `GET /preapproval/:id` (status +
`next_payment_date` + `authorized_payments` como invoices),
`cancelSubscription` = `PUT {status:"cancelled"}`, y reprice/amount
vía `PUT auto_recurring.transaction_amount`. El contrato SHALL NO
materializar planes remotos (`ensurePlan` no-op; el cargo viaja en
`auto_recurring` por suscripción).

#### Scenario: Alta de sub MP feliz

- **WHEN** un alumno se suscribe por CARD a un plan de una academia
  con cuenta BYO MERCADOPAGO
- **THEN** la sub nace PENDING_CARD con `gatewayAccountId` sellado y
  el `registerUrl` es el `init_point` de MP de esa cuenta (el pagador
  autoriza la tarjeta en la página hosted de MP)

#### Scenario: Retorno del pagador MP

- **WHEN** el pagador vuelve del `init_point` por `back_url`
- **THEN** el endpoint de retorno verifica el status remoto real con
  el adaptador de la cuenta: `authorized` activa la suscripción;
  `pending` la deja PENDING_CARD para el webhook/reconcile, nunca la
  activa a ciegas

#### Scenario: Renovación MP

- **WHEN** MP genera un `authorized_payment` del ciclo de una sub
- **THEN** el reconcile (webhook o polling) materializa su Payment
  con `gatewayAccountId` + take congelado, dedup por
  `lastInvoiceId`/refId igual que cualquier provider

### Requirement: Billing events MercadoPago por topics de suscripción

`verifyWebhook` SHALL reconocer los topics de suscripción de MP
(`subscription_authorized_payment`, `subscription_preapproval`) en
ambas shapes (`{type, data:{id}}` e IPN `{topic, id}`) y emitir el
`BillingWebhookEvent` correspondiente tras verificar contra la API
(fetch del recurso, nunca confiar en el payload). El webhook de subs
MP es **app-level**: la academia configura la `webhookUrl` expuesta
en el alta de su cuenta BYO; sin webhook configurado, `reconcileAll`
SHALL cubrir las renovaciones con la misma semántica.

#### Scenario: Notificación de cobro del ciclo

- **WHEN** llega `subscription_authorized_payment` por
  `/webhook/MERCADOPAGO?account=<id>`
- **THEN** el adapter resuelve el `authorized_payment` por API y
  emite el billing event con `subscriptionId` = preapproval id para
  el reconcile puntual de esa sub

#### Scenario: Mismatch cuenta↔sub

- **WHEN** un evento de suscripción llega por `?account=A` y la sub
  matcheada tiene `gatewayAccountId=B`
- **THEN** se rechaza igual que la regla cross-account existente
