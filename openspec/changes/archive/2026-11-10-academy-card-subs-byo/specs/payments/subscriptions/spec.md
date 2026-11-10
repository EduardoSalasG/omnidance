# Delta: payments/subscriptions (subs CARD por cuenta BYO)

## MODIFIED Requirements

### Requirement: Selección de provider de suscripciones

Los services SHALL resolver el provider por **scope de la
suscripción** antes que por moneda: una `MembershipSubscription` con
`gatewayAccountId` non-null SHALL operar sobre el adaptador de esa
`ActorGatewayAccount` (con capability `SubscriptionProvider` exigida
por presencia de métodos); `gatewayAccountId` null SHALL resolver por
moneda del cobro como antes: para CLP el param
`payments.subscription_gateway` contra el `GatewayRegistry`; para
otra moneda el primer adaptador registrado que implemente
`SubscriptionProvider` y cuyo `currencies` la soporte (sin
declaración = sin restricción). La resolución por cuenta SHALL ser
fail-closed: una cuenta inexistente o DISABLED produce error
explícito, nunca cae en silencio a credenciales de plataforma ni de
otra cuenta.

#### Scenario: Provider registrado con capability

- **WHEN** la moneda del cobro es CLP y `payments.subscription_gateway`
  apunta a un adaptador que implementa `SubscriptionProvider`
- **THEN** subscribe/cancel/reconcile operan sobre ese adaptador

#### Scenario: Sub con cuenta propia

- **WHEN** una `MembershipSubscription` tiene `gatewayAccountId`
  non-null y esa cuenta está ACTIVE e implementa
  `SubscriptionProvider`
- **THEN** subscribe/reconcile/cancel/collect operan sobre el
  adaptador de esa cuenta, con las credenciales de la academia

#### Scenario: Sub legacy sin cuenta

- **WHEN** la sub tiene `gatewayAccountId` null y la moneda es CLP
- **THEN** se resuelve el param `payments.subscription_gateway`
  (provider de plataforma), igual que antes del change

#### Scenario: Cuenta de la sub no disponible

- **WHEN** `sub.gatewayAccountId` apunta a una cuenta DISABLED o
  inexistente
- **THEN** la operación remota falla explícito para esa sub (log y
  siguiente en el barrido); jamás se resuelve el provider de
  plataforma para operarla

#### Scenario: Provider por moneda no-CLP

- **WHEN** la moneda del cobro no es CLP y la sub no tiene cuenta
  propia
- **THEN** se usa el primer adaptador con `SubscriptionProvider` que
  la soporte (p.ej. STRIPE para USD/EUR/MXN), ignorando el param

#### Scenario: Moneda sin proveedor

- **WHEN** ningún adaptador registrado implementa
  `SubscriptionProvider` y soporta la moneda
- **THEN** los flujos de suscripción fallan con error explícito de
  moneda no soportada; nunca caen en silencio a un provider de CLP

#### Scenario: Provider sin capability

- **WHEN** el provider resuelto (plataforma o cuenta propia) no
  implementa `SubscriptionProvider` (p.ej. MERCADOPAGO/FINTOC)
- **THEN** los flujos de suscripción fallan con error explícito de
  capability, nunca caen en silencio a otro provider

## ADDED Requirements

### Requirement: Alta de suscripción CARD en pasarela propia de academia

`SubscriptionsService.subscribe` SHALL crear la sub de una academia
con `ActorGatewayAccount` ACTIVE y motor de suscripciones cobrando en
EL PROVEEDOR DE LA ACADEMIA: `sub.gatewayAccountId` queda sellado al
crear la PENDING_CARD, el customer se materializa en la cuenta
propia (`gatewayCustomerIds["<GATEWAY>:<accountId>"]`) y el plan
espejo remoto en la misma cuenta
(`remoteRefs["<GATEWAY>:<accountId>:<CURRENCY>"]`). Academia sin
cuenta o sin motor SHALL rechazar el alta CARD con
`academy.no_gateway` (TRANSFER/claim manual sigue disponible);
academia con `collectionsBlockedAt` SHALL rechazar con
`academy.collections_blocked`; `billingBlockedAt` conserva su
comportamiento.

#### Scenario: Alta BYO feliz

- **WHEN** un alumno se suscribe por CARD a un plan de una academia
  con cuenta BYO ACTIVE y motor
- **THEN** la sub nace PENDING_CARD con `gatewayAccountId` sellado y
  el `registerUrl` corresponde al disclaimer de la cuenta de la
  academia (no de plataforma)

#### Scenario: Academia sin pasarela propia

- **WHEN** la academia no tiene `ActorGatewayAccount` ACTIVE o su
  adaptador no implementa `SubscriptionProvider`
- **THEN** subscribe CARD responde `academy.no_gateway`; la compra
  TRANSFER/claim manual no se ve afectada

#### Scenario: Cobranza bloqueada

- **WHEN** la academia tiene `collectionsBlockedAt` seteado
- **THEN** subscribe CARD responde `academy.collections_blocked`;
  TRANSFER/claim manual sigue disponible

### Requirement: Retorno de tarjeta y webhooks por cuenta

`POST /payments/flow/customer-return` SHALL aceptar `?account=<id>`
opcional: con cuenta resuelve el adaptador por `adapterFor` y activa
la PENDING_CARD del person scoped a esa `gatewayAccountId`; sin
cuenta conserva el comportamiento de plataforma.
`POST /payments/subscription-webhook` SHALL aceptar `?account=<id>`
opcional con la misma resolución, limitando el reconcile a las subs
de esa cuenta. Los billing events por `/:provider/webhook?account=`
SHALL rechazar el evento cuando la sub matcheada por remoteId tiene
`gatewayAccountId` distinto de la cuenta del query (regla
cross-account del confirm de órdenes).

#### Scenario: Customer-return por cuenta

- **WHEN** el alumno vuelve del registro de tarjeta por
  `customer-return?account=<id>`
- **THEN** el token se verifica contra el adaptador de esa cuenta y
  la sub PENDING_CARD con ese `gatewayAccountId` claimea a ACTIVATING

#### Scenario: Webhook cross-account

- **WHEN** un billing event llega por `?account=A` pero la sub
  matcheada por remoteId tiene `gatewayAccountId=B`
- **THEN** el webhook se rechaza (la cuenta que notifica no es la
  dueña de la suscripción)

### Requirement: Reconcile y ciclo de vida multi-cuenta

`reconcileAll`, el scheduler de recordatorios, el collect de
invoices impagas y el sweep de huérfanas SHALL operar sobre todas
las cuentas con subs vivas: las subs se agrupan por
`gatewayAccountId` y cada grupo se procesa con su adaptador (null =
plataforma). Un error remoto en una sub SHALL aislarse a esa sub sin
abortar el barrido ni contaminar otra cuenta. La cancelación de una
sub cuya cuenta ya no está disponible SHALL materializar el estado
local y loggear la imposibilidad remota, sin bloquear al usuario.

#### Scenario: Barrido multi-cuenta

- **WHEN** `reconcileAll` corre con subs ACTIVE/CANCEL_PENDING en
  plataforma y en dos cuentas BYO distintas
- **THEN** cada sub se reconcilia contra el adaptador de su propia
  cuenta; un fallo en una sub no impide el reconcile de las demás

#### Scenario: Cancel con cuenta apagada

- **WHEN** se cancela una sub cuya `ActorGatewayAccount` está
  DISABLED
- **THEN** la sub queda CANCELED localmente con log de la cancelación
  remota no ejecutada; el usuario no ve error

### Requirement: Take de cobranza en altas y renovaciones BYO

Todo Payment materializado por una sub con `gatewayAccountId`
non-null (alta o renovación) SHALL congelar `gatewayAccountId` +
`academyTakeRate`/`academyTakeClp` por la regla
`academy_fee.net_pct` vigente al momento del settle, y SHALL entrar
al `AcademyCollectionsStatement` del período por el filtro BYO
existente. Payments de subs `gatewayAccountId` null SHALL conservar
el comportamiento legacy (sin take, payout histórico).

#### Scenario: Renovación BYO devenga take

- **WHEN** una invoice remota pagada de una sub BYO materializa su
  Payment de renovación
- **THEN** el Payment lleva `gatewayAccountId` + take congelado y es
  elegible para el statement del período

#### Scenario: Renovación legacy sin take

- **WHEN** una invoice de una sub `gatewayAccountId` null
  materializa su Payment
- **THEN** no se congela take; el flujo de payout histórico se
  conserva igual
