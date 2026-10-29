# payouts/payout-rails Specification

## Purpose
TBD - created by archiving change stripe-gateway-payout-rail. Update Purpose after archive.

## Requirements

### Requirement: Port PayoutRail de desembolso

El sistema SHALL abstraer el desembolso de un `Payout` tras un port
`PayoutRail` con implementaciones `MANUAL` y `STRIPE_CONNECT`. La
resolución SHALL ser: `PayoutDestination` `ACTIVE` del actor para el
payout → su rail; sin destino activo o moneda del destino distinta a
la del payout → `MANUAL`. `MANUAL.disburse` SHALL rechazar con
`PAYOUT_REQUIRES_MANUAL`; nunca hay desembolso implícito.

#### Scenario: Actor con destino Connect activo

- **WHEN** un payout CLP tiene destino `STRIPE_CONNECT` ACTIVE con la
  misma moneda
- **THEN** la resolución devuelve el rail Connect con `externalId`
  (`acct_…`) como `destinationRef`

#### Scenario: Sin destino o moneda distinta

- **WHEN** el actor no tiene destino ACTIVE, o su destino es USD y el
  payout es CLP
- **THEN** la resolución devuelve `MANUAL` (mismatch queda notado en
  la respuesta para ops)

### Requirement: Destino de liquidación Connect del actor

El sistema SHALL persistir `PayoutDestination` (`actorType` +
`actorId` + `rail` únicos; `externalId` = cuenta Connect `acct_…`,
`country` ISO-2, `currency` reportada, `status`
`PENDING`/`ACTIVE`/`DISABLED`). `POST /me/payout-destinations` SHALL
crear la cuenta Connect Express (`capabilities` card_payments +
transfers) y devolver `onboardingUrl` (Account Link tipo
`account_onboarding`); SHALL validar ownership del actor
(`PRODUCER`=personId, `ACADEMY`/`VENUE`=ownerId; misma regla de
`/me/payouts`) y responder 503 si Stripe no está configurado.
`GET /me/payout-destinations` SHALL listar los destinos del actor y
refrescar best-effort el estado contra Stripe (`details_submitted` +
`charges_enabled` → `ACTIVE` + `onboardedAt`).

#### Scenario: Productor inicia onboarding

- **WHEN** un productor con `crm.manage` POSTea `{actorType:"PRODUCER",
  actorId:<su id>, country:"MX"}`
- **THEN** se crea la cuenta Express + Account Link, persiste
  `PayoutDestination` PENDING y responde `onboardingUrl`

#### Scenario: Onboarding completado en Stripe

- **WHEN** el actor terminó el flujo en Stripe y consulta `GET
  /me/payout-destinations`
- **THEN** el refresh marca el destino `ACTIVE` con `onboardedAt` y la
  moneda reportada por la cuenta

#### Scenario: Actor ajeno

- **WHEN** se POSTea un destino con `actorId` de otra persona o una
  academia/venue que no posee
- **THEN** responde 403/404 sin crear cuenta ni destino

### Requirement: Desembolso de payout por rail

`POST /admin/payouts/:id/disburse` SHALL ejecutar el desembolso por el
rail resuelto, solo desde estado `APPROVED` (mismo gate que `/pay`).
Con rail `STRIPE_CONNECT` SHALL crear `POST /v1/transfers`
(`amount` en minor units por la tabla zero-decimal, `currency`,
`destination`, `metadata.payoutId`) con `Idempotency-Key:
payout:<payoutId>`; al éxito SHALL marcar el payout `PAID` + `paidAt`
+ `rail:"STRIPE_CONNECT"` + `railRef:"tr_…"` y auditar
`PAYOUT_DISBURSE` con `{rail, ref, amount, currency}`. Con rail
`MANUAL` SHALL responder 409 `requiresManualEvidence`. Un payout ya
`PAID` SHALL responder 409 igual que hoy; un fallo del rail SHALL
dejar el payout `APPROVED` para reintento seguro.

#### Scenario: Desembolso Connect exitoso

- **WHEN** el admin desembolsa un payout APPROVED cuyo actor tiene
  destino Connect ACTIVE en la misma moneda
- **THEN** se crea el transfer, el payout queda `PAID` con `railRef`
  `tr_…` y la auditoría `PAYOUT_DISBURSE` registrada

#### Scenario: Reintento tras timeout

- **WHEN** el primer intento de transfer murió en red pero Stripe sí
  lo creó
- **THEN** el reintento con la misma Idempotency-Key devuelve el
  mismo `tr_…`; nunca hay doble desembolso

#### Scenario: Actor sin destino

- **WHEN** se desembolsa un payout cuyo actor no tiene destino activo
- **THEN** responde 409 `requiresManualEvidence` y `POST /pay` con
  evidence sigue siendo el camino (flujo chileno intacto)

#### Scenario: Sin aprobación

- **WHEN** se desembolsa un payout `PENDING`
- **THEN** responde 409; el gate de aprobación humana no se salta
