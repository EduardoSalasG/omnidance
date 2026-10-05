# Diseño — Suscripciones Flow + Auditoría nivel BIAN

**Fecha**: 2026-09-24
**Estado**: propuesta aprobada (enfoque A confirmado por el usuario)
**Alcance**: `apps/api` (schema, payments, subscriptions, cron, endpoints de auditoría) + `apps/web` (elección suscripción, cancelación, 3 vistas de auditoría) + docs.

## 1. Decisiones confirmadas

| Decisión | Respuesta |
|---|---|
| Tipos suscribibles | `MONTHLY`, `QUARTERLY`, `SEMIANNUAL` (interval 3 × count 1/3/6). `SINGLE`/`CLASS_PACK`/`PERIOD`/`TRIAL` solo pago único |
| Primer cobro | Inmediato — `subscription/create` con inicio hoy, Flow cobra al crear |
| Cobro recurrente fallido | Sin grace period — la vigencia expira en `endsAt`. Flow reintenta (default 3). Notificamos al dancer |
| Cancelación | `at_period_end=1` — conserva acceso hasta `endsAt`, no se vuelve a cobrar |
| Auditoría | **Nivel BIAN para TODA transacción de dinero** (tickets, pases, planes, suscripciones) — no solo suscripciones |
| Visibilidad | Las 3 vistas: dancer ("Mis pagos"), consola productor, consola academia + admin/browse |
| Orden | Auditoría + suscripciones en el mismo cambio |

## 2. Capa de auditoría BIAN (substrato universal)

### 2.1 `GatewayTransaction` — log append-only de llamadas a Flow

Cada request/response HTTP contra Flow (y cada webhook entrante) queda registrado:

```
model GatewayTransaction {
  id            String   @id @default(cuid())
  provider      String   // "FLOW"
  direction     String   // OUTBOUND | INBOUND_WEBHOOK
  endpoint      String   // "payment/create", "subscription/get", ...
  correlationId String   // uuid por operación de negocio — encadena las N llamadas
  requestBody   Json?    // params completos; "s" se reemplaza por sha256(s)[:16]
  responseBody  Json?    // body completo de Flow
  httpStatus    Int?
  durationMs    Int?
  ok            Boolean
  error         String?  // mensaje de error si falla
  paymentId     String?  // vínculo cuando aplique
  createdAt     DateTime @default(now())
}
```

- Nunca se actualiza ni borra. Es la evidencia primaria ante disputas con Flow.
- El adapter `FlowGateway` se refactoriza: un wrapper interno `call(endpoint, params)` firma, ejecuta, mide latencia y persiste — todos los métodos pasan por él.
- Secretos: jamás se persiste `FLOW_SECRET_KEY` ni la firma en claro (solo hash truncado).

### 2.2 `PaymentEvent` — ledger de dominio con hash-chain

```
model PaymentEvent {
  id          String   @id @default(cuid())
  paymentId   String
  seq         Int      // secuencia por payment (1,2,3…)
  type        String   // ORDER_CREATED | GATEWAY_REQUEST | WEBHOOK_RECEIVED |
                       // STATUS_CONFIRMED | SETTLED | FAILED | RENEWAL_SETTLED |
                       // SUBSCRIPTION_CREATED | SUBSCRIPTION_CANCELED | IMPORTED
  actor       String   // system | webhook | polling | admin | cron
  prevHash    String   // hash del evento seq-1 del mismo payment ("GENESIS" si es el 1º)
  payloadHash String   // sha256(prevHash + canonical(payload))
  payload     Json     // {prevStatus?, nextStatus?, amount, gatewayData?…}
  createdAt   DateTime @default(now())

  @@unique([paymentId, seq])
}
```

- `emitPaymentEvent(tx, paymentId, type, actor, payload)` — helper que corre **dentro de la tx** de negocio: lee el último seq/hash del payment, calcula el chain, inserta.
- Si alguien edita una fila histórica, `payloadHash` de la siguiente deja de cuadrar → tamper-evident.
- `GET /payments/:id/events` (dueño o admin) y verificación `GET /admin/payments/:id/verify-chain` → re-calcula y reporta integridad.

### 2.3 Verdad monetaria reportada por Flow — persistida en `Payment`

`payment/getStatus` ya devuelve `paymentData.fee`, `media`, `transferDate`, `amount`. Hoy se descarta. Agregar:

```
gatewayFeeClp        Int?     // fee real cobrado por Flow (auditable vs 3.19%)
gatewayReportedAmount Int?    // monto que Flow dice haber cobrado
gatewayMedia         String?  // webpay / tarjeta / etc.
gatewayPaidAt        DateTime?// fecha real del cobro según Flow
gatewayRaw           Json?    // getStatus completo (evidencia)
```

El webhook/polling los persiste al confirmar PAID. Discrepancia `amount ≠ gatewayReportedAmount` → evento `AMOUNT_MISMATCH` + alerta admin.

### 2.4 Pagos históricos

Backfill: cada `Payment` existente recibe un `PaymentEvent IMPORTED` (seq 1, payload = snapshot actual, `actor: "migration"`). Se declara evidencia débil — el chain arranca ahí.

### 2.5 Vistas por actor

| Actor | Endpoint/UI | Qué ve |
|---|---|---|
| Dancer | `GET /payments/mine` → `/perfil` sección "Mis pagos" | lista: qué compró, monto, fee Flow, fecha real, estado + link a eventos |
| Productor | `GET /payments/by-event/:eventId` (owner/admin) → consola evento | pagos del evento con evidencia gateway |
| Academia | `GET /payments/by-academy/:academyId` (owner/`academies.manage`) → consola | cobros de planes/suscripciones con desglose |
| Admin | `/admin/browse/payment-events`, `/admin/browse/gateway-transactions` | ledger completo navegable |

## 3. Suscripciones (enfoque A — motor de Flow)

### 3.1 Modelo

```
model MembershipSubscription {
  id                 String   @id @default(cuid())
  personId           String
  plan               MembershipPlan @relation(...)
  planId             String
  academyId          String
  flowSubscriptionId String?  @unique
  status             String   // PENDING_CARD → ACTIVE → CANCEL_PENDING → CANCELED
                              //        (+ FAILED_CARD si el registro de tarjeta falla)
  nextInvoiceAt      DateTime? // de Flow next_invoice_date — alimenta la alerta
  lastInvoiceId      String?   // dedup de renovaciones procesadas
  createdAt          DateTime @default(now())
  canceledAt         DateTime?

  @@index([personId]) @@index([nextInvoiceAt, status])
}

MembershipPlan += flowPlanId String?   // plan espejo en Flow (lazy create)
Person         += flowCustomerId String? // customerId en Flow
```

### 3.2 Flujo de suscripción del dancer

1. Card del plan (solo tipos recurrentes): "Comprar" abre elección **Pago único** / **Suscripción**. Suscripción muestra el aviso: *"Se te cobrará automáticamente cada {mes/trimestre/semestre} hasta que lo canceles. Te avisaremos un día antes de cada cobro."* + checkbox de aceptación explícita.
2. `POST /checkout/membership-subscription {planId, acceptRecurring:true}`:
   - Valida plan activo, tipo recurrente, `acceptRecurring` obligatorio.
   - `ensureFlowPlan(plan)` → `plans/create` si `flowPlanId` null (name=`{academy} — {plan}`, amount=price+fee, interval 3, interval_count 1/3/6, `urlCallback` = webhook de planes).
   - `ensureFlowCustomer(person)` → `customer/create` si falta.
   - Si el customer no tiene tarjeta registrada → `customer/register` → responde `{registerUrl}` → front redirige a Flow. Crea `MembershipSubscription(status=PENDING_CARD)` para reanudar al volver.
   - Si ya tiene tarjeta → `subscription/create` directo.
3. Retorno del registro de tarjeta: Flow POSTea `{token}` a `POST /payments/flow/customer-return` → `customer/getRegisterStatus` → guarda `flowCustomerId` + `cardRegistered` → crea `subscription/create` para la subscripción PENDING_CARD del dancer → redirect al web `/academias/:id?sub=ok`.
4. `subscription/create` cobra el primer período de inmediato. `GET /subscriptions/:id` (polling del front) hace refresh activo vía `subscription/get` — cuando el primer invoice figura pagado → `settleMembership` + `Payment` + `PaymentEvent`, igual que el webhook de checkout.

### 3.3 Renovaciones — reconciliación por cron + webhook

- **Cron diario** (`node-cron`, mismo patrón que `crm-triggers.scheduler`): para cada suscripción `ACTIVE`/`CANCEL_PENDING` → `subscription/get`:
  - Invoice nuevo pagado (`payment.status==2`, `invoice.id ≠ lastInvoiceId`) → crea `Payment(refId=mem_<planId>_<invoiceId>, orderType=MEMBERSHIP)` + `settleMembership` (extiende `endsAt` desde la base correcta) + eventos. Esto hace que **payouts funcionen sin cambios**.
  - Actualiza `nextInvoiceAt` y detecta `morose`/cancelaciones remotas → sincroniza estado local.
  - `nextInvoiceAt` dentro de próximas 24h → notificación `membership.renewal_reminder` ("mañana se cobra tu plan X de $Y").
- **Webhook del plan** (`urlCallback` → `POST /payments/subscription-webhook`): Flow notifica el cobro → registramos `GatewayTransaction` inbound + disparamos reconcile inmediato de esa suscripción (fast-path; el cron sigue siendo la red de seguridad — cubre localhost/sandbox donde el webhook no llega).
- Cobro fallido: `morose` o invoice `status=3` → notificación `membership.renewal_failed`; la vigencia **expira naturalmente en `endsAt`** (sin grace, decidido).

### 3.4 Cancelación

- `POST /subscriptions/:id/cancel` (dueño) → `subscription/cancel at_period_end=1` → status `CANCEL_PENDING` + `canceledAt`; el badge en Mis academias / ficha muestra "Se cancela el {endsAt}". Acceso conservado hasta `endsAt`. Sin reactivación en esta iteración (re-suscribirse es el camino).

### 3.5 Notificaciones nuevas

`membership.renewal_reminder` (día antes), `membership.renewal_failed`, `membership.subscription_canceled`, `membership.subscription_started`. Lens `academy`. Audit Log para acciones de staff/admin que toquen suscripciones ajenas.

## 4. Cambios por capa

**Schema**: `GatewayTransaction`, `PaymentEvent`, `MembershipSubscription`, `MembershipPlan.flowPlanId`, `Person.flowCustomerId`, `Payment` +5 campos gateway. `db push` + backfill IMPORTED.

**API**
- `flow.gateway.ts`: wrapper `call()` con logging a `GatewayTransaction`; métodos nuevos `ensurePlan`, `createCustomer`, `registerCustomer`, `getRegisterStatus`, `createSubscription`, `getSubscription`, `cancelSubscription`; `verifyWebhook`/`refreshStatus` persisten la verdad monetaria.
- `webhook.controller.ts`: emite `PaymentEvent` en cada transición; persistencia de campos gateway; nuevo `POST /payments/subscription-webhook` y `POST /payments/flow/customer-return`; `GET /payments/mine`, `GET /payments/by-event/:id`, `GET /payments/by-academy/:id`, `GET /payments/:id/events`.
- `subscriptions.controller.ts` + service: create/cancel/get con refresh activo.
- `subscriptions.scheduler.ts`: cron diario reconcile + reminder.
- `emitPaymentEvent` en `domain/` + spec del hash-chain.

**Web**
- `PlanPurchaseCta`: elección pago único/suscripción + aviso legal + checkbox; estados de registro de tarjeta.
- `/checkout/return`: maneja retorno de registro de tarjeta y estado "activando".
- Mis academias + ficha: badge de suscripción activa, "se cancela el…", botón cancelar.
- `/perfil`: sección "Mis pagos". Consola evento: tabla de pagos. Consola academia: tabla de cobros.
- i18n parts nuevos (`subscriptions.json`, `payments.json`).

**Docs**: `architecture.md` (modelos, endpoints, cron), `flows.md` (secuencias suscripción + cadena de auditoría), openapi/postman regenerados.

## 5. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Webhook Flow no alcanza localhost en dev | Reconcile por cron + refresh activo en polling (mismo patrón ya aplicado a checkout) |
| Invoice duplicado en reconcile | `lastInvoiceId` + refId unique `mem_<planId>_<invoiceId>` → retry seguro |
| `subscription/get` paginado/lento | Solo subs ACTIVE/CANCEL_PENDING; batch acotado; paginación por si acaso |
| Edición de plan (precio) con suscriptores | `plans/edit` sincroniza el Flow-plan al guardar staff; suscripciones vigentes conservan precio del Flow-plan hasta que Flow aplica el cambio (documentado) |
| Hash-chain en tests | `emitPaymentEvent` es unit-testeable con prisma fake; vector conocido sha256 |
| Secretos en logs | sanitización en el wrapper + tests que escanean payloads persistidos |

## 6. Criterios de aceptación

1. Dancer suscribe plan mensual en sandbox → primer cobro Flow inmediato → enrollment ACTIVE con `endsAt` correcto → badge suscripción → ledger completo.
2. Renovación simulada → `endsAt` extendido, Payment creado, reminder un día antes.
3. Cancelar → sin más cobros, acceso hasta `endsAt`, badge "se cancela el…".
4. Cada `Payment` (viejo y nuevo) tiene `PaymentEvent`s verificables; `verify-chain` detecta una fila adulterada.
5. `GatewayTransaction` registra 100% de llamadas Flow con payloads sanitizados.
6. Las 3 vistas de auditoría renderizan datos reales.
7. `tsc` limpio, vitest payments/subscriptions verde, i18n OK, smoke vivo del ciclo completo en sandbox.
