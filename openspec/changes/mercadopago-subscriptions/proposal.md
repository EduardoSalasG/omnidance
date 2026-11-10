# Proposal: suscripciones CARD sobre MercadoPago (BYO)

## Resumen

`academy-card-subs-byo` dejó el motor de suscripciones por cuenta:
cualquier `ActorGatewayAccount` cuyo adaptador implemente
`SubscriptionProvider` vende membresías CARD cobrando en la pasarela
propia del actor. Hoy solo FLOW y STUB implementan el port; una
academia con cuenta MERCADOPAGO vende one-off (Checkout Pro) pero sus
subs CARD caen en `academy.no_gateway`.

Decisión del owner: los procesadores BYO serán **MercadoPago y Flow**.
Este change implementa `SubscriptionProvider` en `MercadoPagoGateway`
sobre la API `preapproval` de MP, con el contrato **without-plan
pending** (`status:"pending"` → `init_point` hosted de MP para
registrar la tarjeta → `back_url` → `authorized`), que calza 1:1 con
el modelo Flow `PENDING_CARD → registerUrl → customer-return →
ACTIVE` sin tokenización en nuestro front.

## Alcance

- `MercadoPagoGateway` implementa `SubscriptionProvider`: customer
  por `/v1/customers`, `registerCustomerCard` = `POST /preapproval`
  pending con `init_point` como registerUrl y
  `external_reference=<subId>`, `createSubscription` resuelve el
  preapproval por `external_reference`, `getSubscription` ←
  `GET /preapproval/:id` (status + `next_payment_date`), invoices ←
  `authorized_payments`, cancel ← `PUT status:"cancelled"`, reprice ←
  `PUT auto_recurring.transaction_amount`.
- `verifyWebhook` extiende a topics de suscripción
  (`subscription_authorized_payment` → BillingWebhookEvent invoice
  paid; `subscription_preapproval` → reconcile puntual). Los webhooks
  MP son app-level: la academia configura la `webhookUrl`
  (`/api/payments/webhook/MERCADOPAGO?account=<id>`) que el alta BYO
  ya le muestra; reconcileAll/polling cubre a quien no la configure.
- Sin cambios de schema, sin Bricks, sin nuevas credenciales (mismo
  `accessToken`), sin UI nueva: `supportsSubs(MP)` pasa a true y el
  gating existente habilita CARD automáticamente.
- Todo el ciclo de vida hereda lo ya resuelto: `providerFor`,
  `?account=`, reconcile multi-cuenta, sweep, take 1% en statement.

## Fuera de alcance

- Contratos `authorized`/`with-plan` (requieren `card_token_id` =
  Bricks/MP.js): si el contrato pending resulta suficiente (lo es),
  nunca se necesitan.
- `collect` on-demand de invoice impaga: `collect?` es opcional en el
  port; se implementa solo si `POST /authorized_payments` calza sin
  fricción, si no queda para slice posterior.
