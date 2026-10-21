# Design — stripe-gateway-payout-rail

## Decisiones

### 1. Sin SDK de Stripe — `fetch` form-encoded

Los tres adaptadores existentes (Flow, MP, Fintoc) llaman REST crudo
con `fetch` + timeout + auditoría `GatewayTransaction` en el `finally`
del wrapper `call()`. Stripe se integra igual: `application/x-www-form-urlencoded`,
`Authorization: Bearer <key>`. Cero dependencias nuevas y el mismo
camino de auditoría/reintentos que el resto del hexágono.

### 2. Checkout Sessions hosted (no PaymentElement)

`createOrder` devuelve `paymentUrl` — la app hoy redirige al checkout
hosted del proveedor en todos los adaptadores. Checkout Sessions es
el análogo exacto de Flow `payment/create`, MP `preference` y Fintoc
`checkout_sessions`:

- `client_reference_id` = `refId` y `metadata[refId]` = `refId`
  (redundante: el primero indexa, el segundo viaja en el objeto).
- `success_url`/`cancel_url` = `returnUrl` (la orden ya existe — el
  regreso siempre aterriza en "tu orden"; el estado lo resuelve el
  polling `GET /payments/:id`).
- `payment_method_types`: `card` + `link` — Stripe Link aparece solo
  si la cuenta lo tiene habilitado; si no, Stripe lo ignora. Es el
  "Stripe Link" del que hablamos: checkout acelerado del comprador,
  gratis dentro de Stripe, no un rail separado.
- `gatewayRef` = `id` de la sesión (`cs_test_…`/`cs_live_…`), mismo
  patrón que Fintoc.

### 3. Unidades monetarias: minor units con tabla zero-decimal

Stripe cobra en minor units (centavos). `Payment.amount` es entero en
unidad mayor… **excepto CLP que es zero-decimal**: 5000 CLP = 5000 en
ambos lados. El adaptador convierte con la tabla oficial zero-decimal
de Stripe (CLP, JPY, KRW, VND, XAF, XOF, MGA, BIF, DJF, GNF, KMF, PYG,
RWF, UGX) — `amount` ×100 salvo zero-decimal. La inversa aplica al
normalizar `gatewayData` (amount_total → unidad mayor). Monedas:
sin whitelist propia — si Stripe la soporta, pasa (consistente con la
política de no-hardcodear mercados); `card` la limita a las de cargo.

### 4. Webhook: firma `Stripe-Signature` + fetch-confirm

Mismo patrón Fintoc (el `WebhookContext.rawBody` ya existe):

- Header `Stripe-Signature: t=<ts>,v1=<sig>`; HMAC-SHA256 de
  `t + "." + rawBody` con `STRIPE_WEBHOOK_SECRET`; tolerancia 5min.
- Tras validar, `GET /v1/checkout/sessions/{id}?expand[]=payment_intent.latest_charge.balance_transaction`
  — una sola consulta trae `payment_status`, `payment_method_types`
  usados, y el fee real (`balance_transaction.fee`).
- `payment_status === "paid"` → PAID; `status === "expired"` → FAILED;
  otro → error para reintento (semántica MP/Fintoc).
- Eventos a escuchar en el endpoint Stripe: `checkout.session.completed`,
  `checkout.session.expired`. El controller no filtra por type — el
  fetch-confirm decide (un `session.async_payment_*` llega también;
  estado no terminal → reintento).

### 5. Routing por moneda (fallback, no re-asignación)

Hoy `CheckoutService.resolveGateway` lee `payments.default_gateway` y
cae al default del env. Con multipaís la orden puede venir en USD/EUR
y el default (Flow, CLP-only) la mataría. Extensión mínima:

- `PaymentGateway` gana `currencies?: string[]` opcional (declaración
  — `undefined` = "sin restricción declarada").
- `GatewayRegistry.resolve(name, currency?)`: el provider pedido gana
  si soporta la moneda; si no, el primer adaptador registrado que la
  soporte; si ninguno la declara, el default actual (que lanzará su
  propio error de moneda en createOrder — comportamiento de hoy).
- Declaraciones: FLOW/FINTOC → `["CLP","MXN"]` según cada uno; STRIPE
  → `undefined` (global); STUB → `undefined` (dev lo cubre todo).
- Orden de resolución: cuenta propia del productor (OWN_GATEWAY)
  sigue ganando primero — el routing por moneda solo aplica al
  camino MANAGED.

### 6. `PayoutRail`: port chico, dos implementaciones

```ts
export interface PayoutRail {
  readonly name: string;              // "MANUAL" | "STRIPE_CONNECT"
  disburse(p: {
    payoutId: string;
    amount: number;                   // unidad mayor, entero
    currency: string;                 // ISO 4217
    destinationRef: string;           // ref del rail (acct_…)
    idempotencyKey?: string;
  }): Promise<{ ref: string }>;       // ref remota (tr_… | "manual")
}
```

- `ManualPayoutRail` existe para que la resolución de rail nunca
  devuelva vacío; su `disburse` lanza `PAYOUT_REQUIRES_MANUAL` — el
  controller traduce a 409 y el admin usa `POST /pay` + evidenceUrl
  (flujo vigente intacto).
- `StripeConnectPayoutRail` → `POST /v1/transfers` con `Idempotency-Key:
  payout:<payoutId>` — reintento tras timeout nunca duplica la
  transferencia. `metadata.payoutId` para reconciliación en Stripe.
- Resolución del rail: `PayoutDestination` ACTIVE del actor → su rail;
  sin destino → MANUAL. Moneda: el `currency` del destino debe calzar
  con el payout — mismatch → MANUAL con warning en `meta` (un CLP
  payout nunca sale por un account USD).

### 7. `PayoutDestination` + onboarding Connect Express

```prisma
model PayoutDestination {
  id         String   @id @default(cuid())
  actorType  String   // PRODUCER | ACADEMY | VENUE
  actorId    String
  rail       String   // STRIPE_CONNECT
  externalId String   // acct_…
  country    String   // ISO-2 del Connect account
  currency   String   // default_currency reportada
  status     String   @default("PENDING") // PENDING|ACTIVE|DISABLED
  lastError  String?
  onboardedAt DateTime?
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
  @@unique([actorType, actorId, rail])
}
```

- `POST /me/payout-destinations {actorType, actorId, country}`:
  ownership igual a `MePayoutsController` (PRODUCER=personId;
  ACADEMY/VENUE=ownerId) → `POST /v1/accounts` (type express,
  `capabilities.card_payments/transfers.requested`) → `POST
  /v1/account_links` (type account_onboarding, refresh/return al
  front) → devuelve `onboardingUrl`.
- `GET /me/payout-destinations`: lista + refresh best-effort
  (`GET /v1/accounts/:id` → `details_submitted && charges_enabled`
  → flip ACTIVE + `onboardedAt`). Sin webhook de `account.updated`
  en este change — el refresh-on-read cubre el caso común.
- Sin STRIPE configurado → 503 explícito.
- Country del actor: viene en el DTO (ISO-2 whitelist Connect) —
  `Person` no tiene país propio y la deducción implícita era frágil.

### 8. `POST /admin/payouts/:id/disburse`

- Solo desde `APPROVED` (igual que `/pay` — el desembolso no salta el
  gate de aprobación humana).
- Resuelve rail → ejecuta → marca `PAID` + `paidAt` + `rail` +
  `railRef`, audit `PAYOUT_DISBURSE` con `{rail, ref, amount,
  currency}`.
- Rail MANUAL → 409 `requiresManualEvidence`.
- Payout ya `PAID` → 409 (idempotencia por estado, igual que hoy).
- Fallo del rail → 502 con el error del proveedor; el Payout queda
  APPROVED para reintentar (Idempotency-Key hace seguro el retry).

## Riesgos

- **Sin Stripe en dev**: todo el cambio degrada limpio — gateway no se
  registra sin `STRIPE_SECRET_KEY` (stub cubre), `/disburse` cae a
  MANUAL, endpoints de destino → 503. Nada rompe el flujo chileno.
- **Idempotencia de transfers**: cubierta por `Idempotency-Key` +
  marca de estado; el único hueco es transfer creada pero respuesta
  perdida y luego "marca manual por /pay" — aceptable ops-wise,
  `railRef` queda visible para reconciliar.
- **Link en payment_method_types**: si la cuenta Stripe no tiene Link
  habilitado, Stripe acepta el valor pero no lo muestra — sin error;
  se verifica en el sandbox al probar.
