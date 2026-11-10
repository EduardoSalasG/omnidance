# Design: SubscriptionProvider sobre MercadoPago `preapproval`

## Contrato elegido: `without-plan-pending`

`POST /preapproval {reason, external_reference, payer_email,
auto_recurring{frequency, frequency_type:"months", transaction_amount,
currency_id, start_date}, back_url, status:"pending"}` → MP devuelve
`id` + `init_point` (página hosted donde el pagador autoriza su
tarjeta) → browser vuelve por `back_url` → el preapproval queda
`authorized` y MP empieza a emitir `authorized_payments` por ciclo.

Calza 1:1 con el modelo Flow (PENDING_CARD → registerUrl →
customer-return → ACTIVE) sin Bricks ni tokenización en el front.

## D1. Mapeo del port `SubscriptionProvider`

- `createCustomer` → `/v1/customers/search?email` + `POST
  /v1/customers` si no existe → customerId MP.
- `getCustomer.hasCard` → **siempre false**: cada preapproval exige
  su propia autorización hosted; MP no reusa tarjeta entre subs sin
  `card_token_id` (contrato authorized, fuera de alcance). Toda sub MP
  pasa por `init_point`.
- `registerCustomerCard(p)` → crea el preapproval pending. El call
  site del engine pasa `p` con `metadata` extendido
  (`{personId, subId, amount, intervalCount}` - bag genérico, otros
  providers lo ignoran). `external_reference = subId` (dedup
  determinística). registerUrl = `init_point` de la respuesta.
- `createSubscription` → `GET /preapproval/search?
  external_reference=<subId>` (fallback: payer_email + reason) →
  mapea el preapproval a `RemoteSubscription`. Si sigue `pending` →
  status no-ACTIVE (UNKNOWN/PENDING según enum) y el reconcile/
  webhook lo termina; jamás se crea un segundo preapproval.
- `getSubscription` → `GET /preapproval/:id` → status
  authorized→ACTIVE, paused→PAUSED/UNKNOWN (per enum), cancelled→
  CANCELED, pending→no-ACTIVE; `nextInvoiceAt` ← `next_payment_date`.
  `invoices` ← `GET /authorized_payments/search?preapproval_id=:id`
  → `{id, paid: status in {"processed","approved"},
  amount: transaction_amount, currency: currency_id, date:
  date_created}`.
- `cancelSubscription` → `PUT /preapproval/:id {status:"cancelled"}`
  (`immediate` no aplica: MP cancel corta futuros cargos; la cortesía
  hasta fin de período es semántica del engine CANCEL_PENDING).
- `ensurePlan`/`syncPlan` → **sin plan remoto** (contrato
  without-plan): ensurePlan = no-op exitoso; el espejo se marca con
  el planId local en `remoteRefs` (o se omite el mark - decisión del
  implementador, documentarla). Reprice/amount-change → `PUT
  /preapproval/:id {auto_recurring:{transaction_amount,
  currency_id}}` por sub, no por plan.
- `collect?` → opcional del port: implementar con `POST
  /authorized_payments` solo si calza limpio; si no, omitir (el
  capability check por presencia lo respeta).
- `listCustomerSubscriptions`/`findCustomerByEmail` →
  `/preapproval/search?payer_email` y `/v1/customers/search?email`
  para sweep y customerReturn.

## D2. Retorno del pagador (back_url es GET)

El `back_url` de MP es redirect GET (a diferencia del form-POST de
Flow). Solución: endpoint de retorno `GET
/payments/mp/subscription-return?account=<id>&sub=<subId>` (o `@All`
sobre el existente - decisión del implementador documentada): resuelve
`adapterFor(account)`, busca el preapproval por
`external_reference=sub`, verifica status remoto REAL (authorized →
claim PENDING_CARD→ACTIVATING→ACTIVE; pending → deja PENDING_CARD
para reconcile/webhook, nunca activa a ciegas) y redirige a la web
éxito/error como `customerReturn` hoy.

## D3. Webhooks app-level

MP notifica por topics configurados en el panel de la app del vendedor
(no por recurso): `subscription_preapproval` (vinculación/cambios),
`subscription_authorized_payment` (cobro del ciclo), `payment`
(pagos). `verifyWebhook` se extiende: con esos topics emite
`BillingWebhookEvent` (`subscription_authorized_payment` → fetch
`GET /authorized_payments/:data.id` → `{subscriptionId:
preapproval_id, invoice:{id, amount, currency, paid}}`;
`subscription_preapproval` → `{subscriptionId}` para reconcile
puntual). Shapes aceptadas: `{type, action, data:{id}}` e IPN legacy
`{topic, id}`. La `webhookUrl` del alta BYO
(`/api/payments/webhook/MERCADOPAGO?account=<id>`) es la URL que la
academia pega en su panel MP (el alta ya la muestra). Sin webhook
configurado, `reconcileAll` cubre las renovaciones igual.

## D4. Sin cambios estructurales

Sin schema nuevo (`flowSubscriptionId` = preapproval id; `remoteRefs`
clave `"MERCADOPAGO:<acc>:<CUR>"` marca lo local), sin credenciales
nuevas (`accessToken` ya existe), sin UI nueva: `supportsSubs(MP)`
pasa a true y el gating existente habilita CARD + take + statement
solos. Copy de `no_gateway` queda para academias sin cuenta o con
FINTOC.

## Riesgos y edge

- **Pendings huérfanos**: cada intento de registro crea un preapproval
  `pending` en MP que queda sin cargo (expira solo); el reuse de
  PENDING_CARD del engine acota la cantidad.
- **Carrera back_url↔autorización**: el return re-verifica el status
  remoto real; si MP aún está procesando, la sub queda PENDING_CARD y
  el webhook/`reconcileAll` la cierra (idempotente por
  `external_reference` y por claim condicional).
- **`flowSubscriptionId @unique`**: ids MP son numéricos únicos por
  collector; colisión cross-cuenta remota pero posible en teoría -
  si se materializa, unique compuesto en slice posterior (documentar
  decisión, sin migración ahora).
- **Verify mínimo MP**: el contrato authorized hace un cobro de
  verificación con reembolso automático; el pending no - ventaja del
  contrato elegido.
- **Smoke real**: credenciales TEST del owner en `apps/api/.env`
  (`MP_SMOKE_ACCESS_TOKEN`/`MP_SMOKE_PUBLIC_KEY`) - alta de cuenta MP
  en una academia demo (p.ej. Academia Tumbao, hoy sin BYO) por el
  PUT cifrado estándar y sub completa end-to-end.
