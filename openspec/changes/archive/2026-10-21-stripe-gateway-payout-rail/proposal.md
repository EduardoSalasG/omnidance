# Change: stripe-gateway-payout-rail

## Por qué

La plataforma solo puede cobrar por rieles chilenos (Flow, Fintoc) o
MercadoPago, y las liquidaciones (`Payout`) se pagan a mano: el admin
transfiere por banco y sube `evidenceUrl`. Para operar fuera de Chile
(roadmap multipaís, spec `platform-multicountry` §"Rieles de pago por
región") se necesita un adaptador global — Stripe — y que el
desembolso se abstraiga tras un port `PayoutRail` en vez de un paso
manual implícito.

## Qué cambia

- **Adaptador `STRIPE`** del port `PaymentGateway` (mismo estilo que
  Flow/MP/Fintoc: `fetch` form-encoded, sin SDK): Checkout Sessions
  con `client_reference_id`/`metadata.refId`, webhook firmado
  `Stripe-Signature` (HMAC-SHA256 `t.rawBody`, tolerancia 5min) +
  fetch-confirm de la sesión, polling por `Payment.gatewayRef` (`cs_…`),
  y verdad monetaria normalizada (fee del balance_transaction).
  Checkout con `card` + `link` (Stripe Link = checkout acelerado,
  incluido sin código extra).
- **Routing por moneda**: `GatewayRegistry` resuelve el adaptador que
  soporta la moneda de la orden cuando el default no la soporta
  (Flow=CLP; USD/EUR/… → Stripe cuando está configurado). Chile sigue
  saliendo por su default — el routing es fallback por moneda, no
  re-asignación por país.
- **Port `PayoutRail`** (`MANUAL` | `STRIPE_CONNECT`): el desembolso
  de un `Payout` se abstrae tras el rail del destino declarado por el
  actor. `MANUAL` reproduce el flujo actual (evidenceUrl).
- **`PayoutDestination`**: destino de liquidación por actor
  (`actorType`+`actorId`+`rail`): Connect Express onboarding via
  Account Links (`POST/GET /me/payout-destinations`), `externalId` =
  `acct_…`, flip a `ACTIVE` cuando `details_submitted`.
- **`POST /admin/payouts/:id/disburse`**: ejecuta el rail del actor
  (transfer `tr_…` a la cuenta Connect, `Payout.rail`/`railRef`
  persistidos, audit `PAYOUT_DISBURSE`); sin destino activo → 409 y el
  flujo manual de `/pay` sigue siendo el camino.
- `Payout` gana `rail`/`railRef`. Migración versionada.
- Env: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_BASE_URL`.
- Docs: architecture.md, openapi/postman regen, `.env.example`.

## Fuera de scope

- **Cobro a cuenta propia sobre Connect** (direct/destination charges
  en la cuenta del productor): `ProducerGatewayAccount` sigue sin
  aceptar `STRIPE` — el onboarding de destino construido acá es el
  prerrequisito; el cobro own-gateway va en el change siguiente.
- Suscripciones por Stripe Billing (el port `SubscriptionProvider`
  queda como slot futuro — Pase Social lo necesitará).
- Rail Fintoc de payouts (Chile sigue manual hoy — el port lo deja
  listo para enchufar después).
- Refunds (decisión de producto: no van), multi-destination por actor.
