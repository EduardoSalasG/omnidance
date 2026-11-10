# Design: motor de suscripciones CARD por cuenta BYO

## Flujo resultante

```
alumno se suscribe a plan de academia
  → subscribe: accounts.activeForAcademy(academyId) + supportsSubs
     sin cuenta/sin motor → academy.no_gateway (solo TRANSFER/manual)
     collectionsBlockedAt → academy.collections_blocked
  → sub nace PENDING_CARD con gatewayAccountId=<cuenta>
  → customer/plan espejo materializados en el Flow/Stub DE LA ACADEMIA
     gatewayCustomerIds["FLOW:<accountId>"] / remoteRefs["FLOW:<acc>:CLP"]
  → needs_card → registerUrl del disclaimer de ESA cuenta
  → customer-return ?account=<id> resuelve adaptador por cuenta → ACTIVE
renovación → webhook subscription-webhook?account=<id> (urlCallback
  horneado por buildAdapter) o billing event por ?account=
  → reconcile por sub.gatewayAccountId → invoice paid → Payment con
    gatewayAccountId + academyTakeClp congelado → statement del mes
```

## Decisiones

### D1. Resolución del provider: `providerFor(sub)` como única fuente

Helper único que usan TODOS los caminos (subscribe, customerReturn,
reconcileSubscription, reconcileAll, cancel, collect, sweep,
drift-check/reprice):

- `sub.gatewayAccountId != null` → `accounts.adapterFor(id)` +
  capability check `SubscriptionProvider` (cuenta DISABLED →
  NotFound del service de cuentas; la sub queda para el próximo
  barrido, nunca cae a credenciales de plataforma).
- `null` → `provider(sub.currency)` actual (plataforma, subs legacy).

En `subscribe` la resolución es proactiva: ANTES de crear la
PENDING_CARD se resuelve `accounts.activeForAcademy(plan.academyId)`;
sin cuenta → `AcademyGatewayUnavailableError` (error `academy.no_gateway`);
cuenta sin motor (`supportsSubs` falso, p.ej. MERCADOPAGO/FINTOC) →
mismo error con la variante de copy de capability; `billingBlockedAt`
ya existe y `collectionsBlockedAt` de la academia →
`AcademyCollectionsBlockedError` (`academy.collections_blocked`).
TRANSFER no consulta nada de esto (nunca toca pasarela).

### D2. Espejos namespaceteados por cuenta

- `Person.gatewayCustomerIds`: clave `"<GATEWAY>:<accountId>"` para
  customers en cuentas propias. La clave `"<GATEWAY>"` plana y el
  espejo `flowCustomerId` quedan reservados a la cuenta de plataforma.
  `ensureFlowCustomer` recibe la clave completa (firma extiende
  `providerName` → scope string; o param nuevo `scope`).
- `MembershipPlan.remoteRefs`: clave `"<GATEWAY>:<accountId>:<CURRENCY>"`
  para planes espejo en cuenta propia; `"<GATEWAY>:<CURRENCY>"` plana y
  `flowPlanId` siguen para plataforma. `remotePlanId`/`remoteRefKey`
  extienden el mismo patrón.
- `MembershipSubscription.flowSubscriptionId` guarda el remoteId en la
  cuenta que corresponda (la columna no cambia; el scope lo da
  `gatewayAccountId`). `@@unique` sobre flowSubscriptionId: los ids de
  Flow son únicos por comercio - dos academias podrían colisionar en
  teoría; si el riesgo se materializa el implementador documenta la
  decisión (p.ej. unique compuesto con gatewayAccountId).

### D3. Retorno de tarjeta por cuenta

`registerCustomerCard` ya recibe `returnUrl`; para cuentas propias se
arma `${apiUrl}/api/payments/flow/customer-return?account=<id>`.
`POST /payments/flow/customer-return` acepta `?account=` opcional:

- con `account` → adaptador de esa cuenta; token → customerId → sub
  PENDING_CARD del person con `gatewayAccountId` = esa cuenta.
- sin `account` → comportamiento actual (plataforma/legacy).

El claim atómico PENDING_CARD→ACTIVATING y toda la carrera existente
se conservan 1:1.

### D4. Webhooks por cuenta

- `POST /payments/subscription-webhook?account=<id>`: la misma ruta
  pública acepta `account` opcional. Con cuenta → adaptador por
  `adapterFor` + reconcile solo de subs `gatewayAccountId=<id>` de ese
  provider. Sin cuenta → comportamiento actual (barrido plataforma).
  La anti-amplificación por token se mantiene igual. `buildAdapter` ya
  hornea `?account=<id>` en `subscriptionCallbackUrl` de cada cuenta
  (hecho en BYO) - los planes espejo nuevos lo llevan desde el
  `plans/create`.
- Billing events (path `/:provider/webhook?account=`): `dispatchBilling`
  matchea por remoteId y además exige consistencia: si la sub matcheada
  tiene `gatewayAccountId` distinto del `account` del query → reject
  (misma regla cross-account del confirm de órdenes). El reconcile
  puntual usa el adaptador de la sub, no el del webhook.

### D5. Reconcile, scheduler, cancel, collect, sweep

- `reconcileSubscription`/`reconcileAll`: resuelven por
  `providerFor(sub)`; `reconcileAll` barre subs de TODAS las cuentas
  (agrupar por gatewayAccountId para reusar adaptador cacheado).
- `cancel`: cancelSubscription remota por `providerFor(sub)`; cuenta
  desaparecida/disabled → la cancelación local procede y queda log
  (la remota la barre el reconcile cuando la cuenta vuelva, o queda
  muerta en su Flow - no bloquea al usuario).
- `collect` de invoice impaga: `customer/collect` por `providerFor`.
- Sweep de huérfanas: hoy contrasta `subscription/create` auditados vs
  remoto del provider de plataforma; extiende el barrido a cada cuenta
  BYO ACTIVE con motor (GatewayAudit ya estampa `gatewayAccountId` en
  las llamadas per-account - filtrar por él).
- Recordatorios (`nextInvoiceAt`, `reminderSentFor`) y dedup
  (`lastInvoiceId`, refId `mem_<planId>_<invoiceId>`) no cambian - el
  remoteId ya es verdad por sub.

### D6. Take en renovaciones y alta

- El Payment que materializa `settleMembership` (alta y renovación) de
  una sub BYO congela `gatewayAccountId` (de la sub) +
  `academyTakeRate`/`academyTakeClp` por la misma regla
  `academy_fee.net_pct` del checkout one-off.
- Ese Payment entra al `AcademyCollectionsStatement` del período por el
  mismo filtro existente (BYO = gatewayAccountId non-null) - sin
  cambios en el engine de statements.
- Subs `gatewayAccountId: null` (legacy): sus renovaciones siguen sin
  take y con el payout histórico - se conserva el comportamiento 1:1.

### D7. Quote/checkout web

- La quote de suscripción de membresía expone `gatewayAvailable`/
  `collectionsBlocked` como las quotes one-off (mismo código
  `academy.no_gateway`/`academy.collections_blocked` + copy existente).
  Sin BYO → el checkout ofrece solo TRANSFER/claim.
- `subscription-manage` (resume registerUrl, cancel) no cambia de
  contrato; el registerUrl nuevo de una sub BYO sale del adaptador de
  su cuenta (resuelto por la sub, no del front).

## Riesgos y casos borde

- **Cuenta DISABLED con subs vivas**: reconcile loggea por sub y sigue
  (aislamiento de errores ya existente). Las renovaciones remotas se
  siguen cobrando en su Flow - el statement sigue devengando take solo
  cuando la invoice se materializa en Payment.
- **Academia migra de our-Flow a BYO con subs vigentes**: subs viejas
  (null) siguen en plataforma; subs nuevas van a su cuenta. Coexisten
  por sub, sin migración.
- **Reprice/drift-check**: `pendingReprice` + `syncPlan` se resuelven
  por `providerFor` - el plan remoto de la promo vive en la cuenta que
  corresponda.
- **customerReturn multi-cuenta**: el token ata a customer→person DENTRO
  de la cuenta; el `?account=` desambigua el adaptador. Sin `?account=`
  en subs BYO no hay resolución (documentado: el returnUrl lo lleva
  siempre para cuentas propias).
