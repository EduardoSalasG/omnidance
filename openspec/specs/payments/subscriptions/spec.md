# payments/subscriptions Specification

## Purpose
TBD - created by archiving change subscription-port-generic. Update Purpose after archive.

## Requirements

### Requirement: Tipos normalizados del puerto de suscripciones

`SubscriptionProvider` SHALL devolver `RemoteSubscription` con campos
normalizados (`status` enum ACTIVE/CANCELED/PENDING/UNKNOWN +
`rawStatus`, `morose`, `cancelAtPeriodEnd`, `nextInvoiceDate`,
`invoices[].paid` ya resuelto por el adaptador,
`payment.{orderRef,data}` con `data` = NormalizedGatewayData).
Ningún consumer de dominio interpreta códigos numéricos del proveedor.

#### Scenario: Suscripción remota activa

- **WHEN** el adaptador consulta una suscripción vigente
- **THEN** devuelve `status:"ACTIVE"` independientemente del código
  crudo del proveedor (conservado en `rawStatus`)

#### Scenario: Suscripción remota cancelada

- **WHEN** el proveedor reporta la suscripción cancelada (Flow status 4)
- **THEN** devuelve `status:"CANCELED"` y el reconcile marca la local
  `CANCELED`

#### Scenario: Invoice pagada

- **WHEN** el adaptador normaliza invoices
- **THEN** cada invoice lleva `paid` ya resuelto según la regla del
  proveedor y `payment.data` = verdad monetaria normalizada

### Requirement: Selección de provider de suscripciones

Los services SHALL resolver el provider por moneda del cobro: para CLP
el param `payments.subscription_gateway` se resuelve contra el
`GatewayRegistry`; para otra moneda SHALL usarse el primer adaptador
registrado que implemente `SubscriptionProvider` y cuyo `currencies`
la soporte (sin declaración = sin restricción). En ambos casos la
capability `SubscriptionProvider` SHALL exigirse por presencia de
métodos.

#### Scenario: Provider registrado con capability

- **WHEN** la moneda del cobro es CLP y `payments.subscription_gateway`
  apunta a un adaptador que implementa `SubscriptionProvider`
- **THEN** subscribe/cancel/reconcile operan sobre ese adaptador

#### Scenario: Provider por moneda no-CLP

- **WHEN** la moneda del cobro no es CLP
- **THEN** se usa el primer adaptador con `SubscriptionProvider` que la
  soporte (p.ej. STRIPE para USD/EUR/MXN), ignorando el param

#### Scenario: Moneda sin proveedor

- **WHEN** ningún adaptador registrado implementa
  `SubscriptionProvider` y soporta la moneda
- **THEN** los flujos de suscripción fallan con error explícito de
  moneda no soportada; nunca caen en silencio a un provider de CLP

#### Scenario: Provider sin capability

- **WHEN** el provider resuelto no implementa `SubscriptionProvider`
  (p.ej. MERCADOPAGO hoy)
- **THEN** los flujos de suscripción fallan con error explícito de
  capability, nunca caen en silencio a otro provider

### Requirement: Compatibilidad de comportamiento

La semántica de reconcile/cancel/mora/compensación SHALL conservarse
1:1 respecto al comportamiento previo a la normalización.

#### Scenario: Estado remoto desconocido

- **WHEN** el proveedor reporta un código no mapeado
- **THEN** el adaptador emite `status:"UNKNOWN"` con `rawStatus` y el
  service lo trata como vigente (log de warning), igual que antes

### Requirement: Suscripción del bailarín sobre Stripe Billing

`StripeGateway` SHALL implementar `SubscriptionProvider`:
`ensurePlan`/`syncPlan` crean/actualizan Product+Price espejo en la
cuenta de plataforma por `tierCode`×moneda; `createCustomer`/
`getCustomer` manejan el Customer Stripe del bailarín;
`createSubscription` SHALL crear una Checkout Session
`mode=subscription` con `subscription_data.metadata.personId` y
devolver su URL (el registro de tarjeta ocurre dentro de Checkout);
`getSubscription`/`cancelSubscription` normalizan al `RemoteSubscription`
del port (`cancelAtPeriodEnd`, `nextInvoiceDate`, `morose` por
`invoice.payment_failed`/`past_due`). `payments.subscription_gateway`
SHALL aceptar `STRIPE` como motor válido para el pase.

#### Scenario: Suscripción vía Checkout

- **WHEN** un bailarín suscribe y Stripe crea la Checkout Session
- **THEN** vuelve a la app y `invoice.paid` (webhook firmado) activa
  su `SocialPass`; la confirmación v1 puede además resolverse por
  `getSubscription` al regresar (mismo patrón polling del checkout)

### Requirement: Créditos del pase

`SocialPass.creditsBalance` SHALL consumirse solo vía
`SocialPassLedger` (`RESET` al allotment `creditsPerPeriod` en cada
`invoice.paid`, `REDEEM` por entrada pagada con crédito, `GRANT`
manual admin). El reset SHALL ser duro por período (créditos no
acumulan; copy explícito al usuario). Créditos aplican a
tickets de eventos sociales/prácticas; NUNCA a membresías, clases
o productos de academia.

#### Scenario: Renovación resetea

- **WHEN** `invoice.paid` de un ciclo nuevo llega
- **THEN** `creditsBalance = creditsPerPeriod` y el ledger gana
  `RESET`; el remanente anterior se pierde

#### Scenario: Redención atómica

- **WHEN** el bailarín usa 1 crédito en una entrada
- **THEN** decrementar el balance + `REDEEM` + crear la orden $0 va
  en la misma transacción; sin crédito suficiente → 409 y nada muta

### Requirement: Beneficios de precio en checkout

Con `SocialPass` `ACTIVE` el checkout de ticket SHALL usar
`presalePrice` aunque la preventa haya cerrado, y SHALL eximir
`doorAppFeeClp` (desglose con línea visible del beneficio). Sin pass,
el pricing actual no cambia. El beneficio aplica al comprador
suscrito; nunca a tickets para terceros/regalos del mismo orden.

#### Scenario: Suscriptor en puerta

- **WHEN** un bailarín con pass ACTIVE compra ya cerrada la preventa
- **THEN** paga `presalePrice` sin `doorAppFeeClp`; el desglose lo
  muestra como beneficio del pase

### Requirement: Gating por flag

Todos los endpoints y superficies del pase SHALL responder 404 con
`social_pass` apagado y el front SHALL no renderizar enlaces,
CTAs ni la página `/pase`.

#### Scenario: Flag OFF

- **WHEN** `social_pass` está `enabled:false`
- **THEN** `GET /me/social-pass` → 404, `/pase` no se enlaza en nav
  y el checkout no muestra beneficios aunque exista `SocialPass`

### Requirement: Billing events Stripe para membresías

El webhook STRIPE SHALL enrutar `invoice.paid`,
`invoice.payment_failed` y `customer.subscription.deleted` a la
`MembershipSubscription` cuyo remoteId coincida con la suscripción del
evento, aplicando la misma semántica del reconcile (settle de invoice,
mora, cancelación) con dedup idempotente; la misma invoice procesada
por webhook y por polling SHALL liquidarse una sola vez.

#### Scenario: renovación de membresía Stripe

- **WHEN** llega `invoice.paid` cuya subscription matchea una
  `MembershipSubscription` activa
- **THEN** el settle de renovación corre igual que por reconcile
  (extiende vigencia, emite Payment, dedup por invoice)

#### Scenario: evento sin match

- **WHEN** la subscription del evento no matchea membresía, sub de
  plataforma ni pase social
- **THEN** el webhook responde 200 ignorando el evento

### Requirement: Billing events Stripe para suscripciones de plataforma

El webhook STRIPE SHALL enrutar los mismos eventos a la
`PlatformSubscription` cuyo remoteId coincida, con la semántica del
reconcile de plataforma (RENEWAL_SETTLED restaura tier/limpia gracia y
bloqueo, invoice impaga abre gracia, cancel remoto marca CANCELED).

#### Scenario: invoice impaga de tier

- **WHEN** llega `invoice.payment_failed` para una
  `PlatformSubscription` ACTIVE
- **THEN** abre la ventana de gracia/bloqueo igual que el reconcile;
  sin esperar al polling

### Requirement: `invoices[].amount` normalizado a número

El adaptador SHALL entregar `SubscriptionInvoice.amount` como `number`
en unidad mayor de la moneda, aunque el proveedor lo reporte como
string (Flow devuelve `"25000.0000"`). La coerción vive en la
normalización del adaptador (frontera), nunca en los consumers del
reconcile.

#### Scenario: Invoice Flow con amount string

- **WHEN** `subscription/get` devuelve una invoice con
  `amount: "25000.0000"` (string, formato wire de Flow)
- **THEN** `RemoteSubscription.invoices[].amount` es `25000` (number)
  y el reconcile puede persistirlo en `Payment.amount` (Int)

#### Scenario: Invoice sin amount válido

- **WHEN** la invoice no reporta amount o no es coercible
- **THEN** `amount` es `0` y el consumer aplica su fallback de precio
  del plan (comportamiento previo conservado)

### Requirement: Redirect directo al registro de tarjeta

Cuando el checkout de suscripción responde `needs_card` con
`registerUrl`, el front SHALL navegar de inmediato al disclaimer del
proveedor (`location.href`), sin interstitial intermedio.

#### Scenario: needs_card en checkout membresía

- **WHEN** `POST /checkout/membership-subscription` responde
  `needs_card` con `registerUrl`
- **THEN** el browser navega directo al registerUrl del proveedor

### Requirement: Retorno de tarjeta a página de éxito compartida

El `customer-return` de suscripciones SHALL redirigir a
`/checkout/return?sub=ok|error`, la misma página de resultado de los
checkouts one-off, con `src=member` para que el CTA apunte a
`/academias` (bailarín) y el default siga siendo la consola de
suscripción del actor.

#### Scenario: Registro de tarjeta completado

- **WHEN** el pagador vuelve del disclaimer con tarjeta registrada
- **THEN** el endpoint redirige a `/checkout/return?sub=ok&src=member`
  y la página muestra el éxito con CTA a Mis academias

### Requirement: Alta por transferencia con activación por comprobante

El checkout de suscripción SHALL ofrecer `paymentMethod: "TRANSFER"`
además de tarjeta. Con transferencia la suscripción queda
`PENDING_PAYMENT` (sin Flow) y se crea un `Payment` PENDING
claim-elegible; el subscriber sube comprobante (OwnMethodClaim) y el
dueño del dinero lo valida (academia para MEMBERSHIP, admin plataforma
para PLATFORM_SUB). Al aprobarse, el Payment pasa PAID, la suscripción
se ACTIVA con su primer período y se aplican los efectos del dominio.

#### Scenario: Alta membresía por transferencia

- **WHEN** el bailarín elige transferencia, sube el comprobante y la
  academia lo aprueba
- **THEN** el Payment queda PAID, la suscripción ACTIVE y el
  Enrollment vigente por el primer ciclo

### Requirement: Renovación manual por ciclo

Una suscripción con método transferencia SHALL generar un Payment
PENDING al iniciar cada ciclo de renovación, con notificación al
subscriber y camino de gracia/suspensión si no se valida a tiempo.
Con tarjeta, la renovación sigue siendo automática por Flow.

El job diario `subscriptions.reconcile` (mismo scheduler de mora y
gracia) recorre las subs `TRANSFER` en estado `ACTIVE` cuyo
`currentPeriodEnd` entra en la ventana `billing.manual_renewal.lead_days`
(default 5 días) y emite la orden del ciclo siguiente
(`mem_<planId>_manual_<n+1>` / `platsub_<subId>_manual_<n+1>`, mismo
correlativo del alta) con el cargo re-resuelto del día (promo vigente
o precio lleno). Una orden PENDING viva cubre el ciclo: el barrido es
idempotente y no duplica ni re-avisa.

#### Scenario: Ciclo siguiente de sub manual

- **WHEN** el `currentPeriodEnd` de una sub manual ACTIVE entra en la
  ventana de anticipación
- **THEN** se crea el Payment PENDING del ciclo (evento ORDER_CREATED)
  y el subscriber recibe la notificación `*.transfer_renewal` con la
  URL del claim para subir comprobante

#### Scenario: Gracia de membresía por falta de comprobante

- **WHEN** el `currentPeriodEnd` de una membresía manual vence sin un
  Payment PAID del ciclo
- **THEN** el acceso a reservas sigue hasta `endsAt +
  academy.renewal.grace_days` del Enrollment (misma gracia que una
  compra vencida) y la sub queda ACTIVE con su orden PENDING: un
  comprobante tardío la reactiva y el período corre desde el pago

#### Scenario: Gracia y bloqueo de academia por falta de comprobante

- **WHEN** el `currentPeriodEnd` de una sub de plataforma ACADEMY vence
  sin claim aprobado
- **THEN** la academia recibe `billingGraceUntil = currentPeriodEnd +
  academy_billing.grace_days` y el aviso `academy.billing_grace` una
  sola vez por período; vencida la gracia el job la marca
  `billingBlockedAt` (mismo enforcement de la mora de tarjeta) y el
  settle del claim lo deshace al aprobar

#### Scenario: Productor Pro sin comprobante

- **WHEN** el `currentPeriodEnd` de una sub de plataforma PRODUCER vence
  sin claim aprobado
- **THEN** se notifica `producer.pro_renewal_failed` una sola vez por
  período (misma política que la mora de tarjeta, sin degradación
  automática del tier)

#### Scenario: Settle del claim del ciclo nuevo

- **WHEN** se aprueba el claim de la orden de renovación
- **THEN** el mismo settle activa/perpetúa la sub: `currentPeriodEnd`
  avanza un ciclo desde el fin del período previo si aún es futuro
  (nunca desde hoy), y queda despejada la gracia/bloqueo de la academia
  o restaurado el proTier del productor

### Requirement: Cobro on-demand de invoice impaga (collect)

`SubscriptionProvider` SHALL exponer `collect()` para efectuar un
cargo on-demand sobre el medio de pago registrado del customer,
independiente de las invoices del motor de suscripciones. El
adaptador SHALL normalizar el resultado a
`{outcome: "COLLECTED" | "PENDING" | "FAILED", flowOrder?,
paymentUrl?, gatewayData?}`:

- `COLLECTED`: cargo sincrónico exitoso sobre la tarjeta registrada;
  `gatewayData` = NormalizedGatewayData del pago.
- `PENDING`: el customer no tiene medio de pago registrado y el
  proveedor generó un cobro por link/email; `paymentUrl` lleva la URL
  de pago para ofrecérsela al actor.
- `FAILED`: el cargo a la tarjeta fue rechazado.

#### Scenario: Collect con tarjeta registrada

- **WHEN** el customer tiene tarjeta vigente y se invoca collect por
  un monto y concepto dados
- **THEN** el adaptador ejecuta el cargo contra la pasarela
  (Flow `customer/collect` type=1) y devuelve `COLLECTED` con la
  verdad monetaria del pago en `gatewayData`

#### Scenario: Collect sin tarjeta

- **WHEN** el customer ya no tiene medio de pago registrado
- **THEN** el adaptador devuelve `PENDING` con `paymentUrl` (link o
  cobro por email, según el proveedor) sin lanzar excepción

### Requirement: `invoices[].nextAttemptDate` normalizado

`SubscriptionInvoice` SHALL exponer `nextAttemptDate`
(`string | null | undefined`) con la fecha del próximo reintento
programado por el proveedor (Flow `next_attemp_date`). `null`
significa que el proveedor ya no reintentará la invoice; `undefined`
significa que el adaptador no puede saberlo.

#### Scenario: Invoice con retry agotado

- **WHEN** una invoice impaga en Flow tiene `next_attemp_date: null`
- **THEN** el adaptador la normaliza con `nextAttemptDate: null`

### Requirement: Recuperación de mora por collect en el reconcile

Cuando el reconcile de una suscripción (membresía o plataforma)
encuentre invoices impagas cuyo proveedor **ya no reintentará**
(`nextAttemptDate === null` o sub `morose`), SHALL intentar un
`collect()` por cada una elegible ANTES de disparar la notificación
de mora, con estas reglas:

- La elegibilidad exige ausencia de retry agendado: una invoice con
  `nextAttemptDate` futura NUNCA se colecta (el cobro duplicaría el
  reintento del proveedor).
- `commerceOrder` = refId de renovación existente
  (`platsub_<subId>_<invoiceId>` / `mem_<planId>_<invoiceId>`), dentro
  del límite de 45 caracteres de Flow, de modo que el Payment resulta
  en el mismo slot de dedup que usa el settle de invoices.
- Si ya existe un Payment con ese refId, la invoice no se colecta de
  nuevo (dedup: un intento automático por invoice).
- `COLLECTED` SHALL crear el Payment y liquidarlo por el camino de
  renovación estándar (`kind:"renewal"` → RENEWAL_SETTLED, efectos de
  desbloqueo/gracia y resguardo).
- `PENDING` SHALL dejar el Payment PENDING (los caminos existentes de
  webhook/polling lo liquidan si el actor paga el link) y agregar la
  `paymentUrl` al `data` de la notificación de mora.
- `FAILED` SHALL marcar el Payment FAILED (queda la evidencia del
  intento) y la mora continúa su curso normal (gracia/bloqueo).
- Un error de API del collect SHALL abortar el intento sin crear
  Payment (transitorio: el próximo reconcile reintenta) y cortar el
  loop de invoices de esa corrida.

#### Scenario: Renovación recuperada por collect

- **WHEN** una suscripción ACTIVE tiene una invoice impaga sin
  `nextAttemptDate` y el collect de la tarjeta del subscriber cobra
  exitoso
- **THEN** se crea el Payment de renovación PAID con ledger
  ORDER_CREATED→STATUS_CONFIRMED→RENEWAL_SETTLED y la mora no emite
  notificación de gracia

#### Scenario: Invoice con retry agendado no se colecta

- **WHEN** una invoice impaga tiene `nextAttemptDate` en el futuro
- **THEN** el reconcile no invoca collect para ella

#### Scenario: Collect rechazado

- **WHEN** el collect devuelve `FAILED` (tarjeta rechazada)
- **THEN** el Payment queda FAILED, la mora sigue su curso y ningún
  reconcile posterior reintenta el collect de esa invoice

#### Scenario: Collect cae a link de pago

- **WHEN** el customer no tiene tarjeta y el collect devuelve
  `PENDING` con `paymentUrl`
- **THEN** la notificación de mora incluye la `paymentUrl` en su
  `data` y el Payment queda PENDING hasta que el actor pague o expire
