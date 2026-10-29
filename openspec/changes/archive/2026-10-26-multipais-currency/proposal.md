# Proposal; multipais-currency

## Why

`multipais-foundation` dejó el contrato de moneda por mercado, pero hoy
solo `Event`, `Ticket`, `Payment` y `PlatformSubscription` declaran
`currency`. Los precios de tiers SaaS (`academy_tier.*`,
`producer_tier.*`) y las membresías de academia (`MembershipPlan.price`)
siguen implícitos en CLP, el provider de suscripciones es uno solo por
param global (Flow) y `TierPrice`; el price book tier×país; solo lo
usa el Pase Social. Sin este change no se puede cobrar una suscripción
ni una membresía fuera de Chile.

## What Changes

- **`Country.currency`** (ISO-4217): un país tiene una moneda de
  cobro; `academy.city.country.currency` y `event → venue.city.country`
  resuelven la moneda del actor/contexto (fallback CL/CLP).
- **Price book canónico**: `chargeSpec` resuelve `TierPrice(tierCode,
  kind, billingCycle, countryCode)` antes que los params
  `*_monthly_clp`; el param queda como fallback CL. `TierPrice` pasa a
  cubrir `kind=ACADEMY|PRODUCER` (hoy solo SOCIAL_PASS).
- **País de cobro de la suscripción de plataforma**:
  `PlatformSubscription.countryCode`; ACADEMY lo deriva de
  `academy.city.country` (null → CL); PRODUCER lo declara el actor al
  suscribir (`billingCountry`, default CL).
- **Moneda en membresías**: `MembershipPlan.currency` (default = moneda
  de la academia al crear), `MembershipSubscription.currency` y
  `PaymentClaim.currency` (snapshot; el alumno declara en la moneda de
  la academia).
- **Provider de suscripciones por moneda**: CLP sigue en el param
  `payments.subscription_gateway` (Flow); otra moneda resuelve el
  primer `SubscriptionProvider` registrado que la soporte (Stripe).
  Plan espejo: `MembershipPlan.flowPlanId` sigue para Flow/CLP; refs
  remotas de otros gateways en `MembershipPlan.remoteRefs`
  (`{"<GATEWAY>:<CURRENCY>": "<remoteId>"}`).
- **Órdenes ya monetizadas**: venta de puerta (`createDoorSale`) y
  clase suelta (`WORKSHOP`) snapshottean la moneda del contexto
  (`event.currency` / moneda de la academia) en vez de caer al default
  CLP del schema.
- **Promos de monto fijo**: `PlatformPromo` FIXED_CLP aplica solo a
  cargos CLP; PERCENT a cualquier moneda.
- **Front**: `formatMoney(amount, currency)` extiende `lib/intl.ts`;
  checkout, billing y listados de precios muestran la moneda real del
  contexto.
- **Admin**: TierPrice gestionable vía endpoints admin (list/create/
  update); qué mercados están abiertos queda en data, no en código.

No hay conversión FX: cada reporte/agregado agrupa por moneda.

## Capabilities

### New Capabilities

- `platform-multicountry`: price book por país, moneda del actor por
  país y selección de provider de suscripciones por moneda
  (complementa los requirements de `multipais-foundation`).

### Modified Capabilities

- `payments/subscriptions`: la selección de provider gana eje moneda
  (param CLP + provider por `currencies` para el resto).
- `academy-billing`: el precio del tier se resuelve por país del actor
  vía price book, no solo por `PlatformParam`.
- `academies/payment-claims`: el monto declarado lleva moneda (la de la
  academia).
- `checkins/door-sale`: el ticket de puerta hereda `event.currency`.
- `payments/class-dropin`: la orden WORKSHOP usa la moneda de la
  academia, no CLP implícito.
- `platform-billing`: alcance de promos FIXED_CLP por moneda.

## Impact

- **Schema/migraciones**: `Country.currency`, `MembershipPlan.currency`
  + `remoteRefs`, `MembershipSubscription.currency`,
  `PaymentClaim.currency`, `PlatformSubscription.countryCode`;
  defaults CLP/CL, sin pérdida.
- **API**: `platform-subscriptions.service` (`chargeSpec`, subscribe),
  `subscriptions.service` (provider por moneda, espejo remoto),
  `checkout.service` (door sale + drop-in currency), admin endpoints
  TierPrice.
- **Web**: `lib/intl.ts`, superficies de precio (checkout, billing,
  promos, planes).
- **Deps**: ninguna nueva.
- **Fuera de scope**: FX, payouts multi-moneda (PayoutRail ya lo
  abstrae), reportes cross-moneda consolidados.
